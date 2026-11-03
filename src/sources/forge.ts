/** Gitea and GitLab Sources: webhook ingress for a self-hosted repository, with optional API replies. */
import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { OutboundMessage, Trigger } from '../core/index.ts'
import type { SourceIngress, SourceKind } from './kind.ts'

export const GITEA = 'gitea'
export const GITLAB = 'gitlab'
export type ForgeProvider = typeof GITEA | typeof GITLAB
const baseUrl = z.string().trim().max(2000).refine(value => !value || /^https?:\/\/\S+$/.test(value), 'an http(s) URL')
const ForgeConfigSchema = z.object({
  baseUrl: baseUrl.default(''),
  repository: z.string().trim().max(300).default(''),
  token: z.string().trim().max(500).default(''),
  secret: z.string().trim().max(200).default(''),
  agentName: z.string().trim().min(1).max(100).default('dsh-superagent'),
}).strict()
export type ForgeConfig = z.infer<typeof ForgeConfigSchema>
const object = (value: unknown): Record<string, unknown> => typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
const text = (value: unknown): string => typeof value === 'string' ? value : ''
const number = (value: unknown): number => typeof value === 'number' ? value : Number(value) || 0
const configured = (config: ForgeConfig): boolean => !!config.baseUrl && !!config.repository
const fields = (provider: ForgeProvider) => [
  { key: 'baseUrl' as const, type: 'text' as const, label: { zh: '站点地址', en: 'Site URL' },
    hint: { zh: `例如 https://${provider}.example.com；webhook 和回复都用这个地址。`, en: `For example https://${provider}.example.com; webhooks and replies use this address.` } },
  { key: 'repository' as const, type: 'text' as const, label: { zh: '仓库', en: 'Repository' },
    hint: { zh: 'Gitea 用 owner/repo；GitLab 用完整路径 group/subgroup/repo。', en: 'For Gitea use owner/repo; for GitLab use the full group/subgroup/repo path.' } },
  { key: 'token' as const, type: 'text' as const, label: { zh: 'API Token', en: 'API token' },
    hint: { zh: '可选；填写后 dsh-superagent 才能在 issue/PR 下回复。没有 token 时入站仍可用，回复会丢弃。', en: 'Optional; replies are posted only with a token. Ingress still works without one, and replies are dropped.' } },
  { key: 'secret' as const, type: 'text' as const, label: { zh: 'Webhook 密钥', en: 'Webhook secret' },
    hint: { zh: 'Gitea 的 secret（HMAC）或 GitLab 的 Secret Token；留空关闭 webhook 入口。', en: 'Gitea\'s secret (HMAC) or GitLab\'s Secret Token; empty disables the webhook endpoint.' } },
  { key: 'agentName' as const, type: 'text' as const, label: { zh: '智能体账号名', en: 'Agent account name' },
    hint: { zh: '消息中出现 @这个名字 时才算明确点名。', en: 'A message is addressed when it mentions @this name.' } },
]
const policy = (provider: ForgeProvider): SourceKind<ForgeConfig>['policy'] => ({
  schema: z.object({ allowed: z.array(z.object({ id: z.string().trim().min(1).max(200), name: z.string().trim().max(100).optional() }).strict()).default([]) }).strict(),
  fields: [{ key: 'allowed', type: 'rows', label: { zh: `允许从 ${provider} 发起工作的账号`, en: `Accounts that may originate work from ${provider}` },
    columns: [{ key: 'id', type: 'text', label: { zh: '用户名', en: 'Username' } },
      { key: 'name', type: 'text', label: { zh: '名字', en: 'Name' }, optional: true }] }],
  explicit: { zh: `在 ${provider} 上点名智能体的消息`, en: `A ${provider} message that mentions the agent` },
  rows: () => [{ id: provider, label: { zh: provider, en: provider },
    note: { zh: 'Issue、合并请求和评论都进入同一个来源。', en: 'Issues, merge requests and comments all enter through this Source.' },
    cells: { listedUnaddressed: true, unlistedAddressed: true, unlistedUnaddressed: false } }],
})
/** A self-hosted Gitea repository. Webhooks arrive at `/orchestrator/git/gitea`; comments are posted with an API token. */
export const giteaKind: SourceKind<ForgeConfig> = {
  kind: GITEA, title: { zh: 'Gitea', en: 'Gitea' },
  description: { zh: '通过 webhook 接收自建 Gitea 仓库的 Issue 和合并请求，用 API token 回复。', en: 'Receive Issues and pull requests from a self-hosted Gitea repository by webhook, and reply with an API token.' },
  defaultEnabled: false, schema: ForgeConfigSchema, fields: fields(GITEA), health: [],
  scope: (_input, config) => configured(config) ? { listened: true, observed: false, row: GITEA } : { listened: false, reason: 'not_configured' },
  policy: policy(GITEA),
  channel: {
    allowed: () => true,
    send: (_host, message, config) => sendComment(GITEA, config, message),
    link: address => link(GITEA, address),
  },
  textLimit: { replyWords: 100 },
  ingress(input, config) { return trigger(GITEA, input, config) },
  threadContext: {
    messageId: trigger => trigger.id,
    async read(_commands, trigger, part) {
      return part === 'thread' ? { messages: [{ id: trigger.id, from: trigger.actor.id, at: trigger.at, text: trigger.text }], body: { page: GITEA } }
        : { messages: [], body: { page: GITEA } }
    },
  },
  find: _query => ({ threads: [], terms: [] }),
  link: async (trigger, _host, config) => ({ url: linkUrl(GITEA, trigger, config) }),
}
/** A self-hosted GitLab project. Webhooks arrive at `/orchestrator/git/gitlab`; notes are posted with a personal access token. */
export const gitlabKind: SourceKind<ForgeConfig> = {
  kind: GITLAB, title: { zh: 'GitLab', en: 'GitLab' },
  description: { zh: '通过 webhook 接收自建 GitLab 项目的 Issue 和合并请求，用 API token 回复。', en: 'Receive Issues and merge requests from a self-hosted GitLab project by webhook, and reply with an API token.' },
  defaultEnabled: false, schema: ForgeConfigSchema, fields: fields(GITLAB), health: [],
  scope: (_input, config) => configured(config) ? { listened: true, observed: false, row: GITLAB } : { listened: false, reason: 'not_configured' },
  policy: policy(GITLAB),
  channel: {
    allowed: () => true,
    send: (_host, message, config) => sendComment(GITLAB, config, message),
    link: address => link(GITLAB, address),
  },
  textLimit: { replyWords: 100 },
  ingress(input, config) { return trigger(GITLAB, input, config) },
  threadContext: {
    messageId: trigger => trigger.id,
    async read(_commands, trigger, part) {
      return part === 'thread' ? { messages: [{ id: trigger.id, from: trigger.actor.id, at: trigger.at, text: trigger.text }], body: { page: GITLAB } }
        : { messages: [], body: { page: GITLAB } }
    },
  },
  find: _query => ({ threads: [], terms: [] }),
  link: async (trigger, _host, config) => ({ url: linkUrl(GITLAB, trigger, config) }),
}
/** Translate a provider webhook payload carried in `input.meta` into a Trigger. */
export function trigger(provider: ForgeProvider, input: SourceIngress, config: ForgeConfig): Trigger {
  const meta = object(input.meta)
  const payload = object(meta.body)
  const event = text(meta.event)
  const record = provider === GITEA ? giteaEvent(payload, event, config) : gitlabEvent(payload, config)
  if (!record.number) throw new Error(`The ${provider} webhook names no Issue or merge request`)
  const repository = record.repository || config.repository
  if (!repository) throw new Error(`The ${provider} webhook names no repository`)
  const title = record.title || record.text || `#${record.number}`
  const actor = record.actor || 'unknown'
  const body = record.text || title
  const addressed = body.toLowerCase().includes(`@${config.agentName.toLowerCase()}`) ? 'mention' as const : undefined
  const thread = `${repository}#${record.number}`
  const id = `${provider}:${thread}:${event || record.kind}:${record.eventId || createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 16)}`
  return {
    id, source: provider, threads: [{ source: provider, id: thread }], actor: { source: provider, id: actor }, human: !record.bot,
    ...addressed ? { addressed } : {}, at: record.at || new Date().toISOString(), text: title && record.text && record.title ? `${record.title}\n\n${record.text}` : body,
    channel: { source: provider, thread: `${provider}:${thread}`, address: { repository, number: String(record.number), kind: record.kind } },
    url: linkUrlFor(provider, config, repository, record.number, record.kind),
    meta: { number: String(record.number), isPr: record.kind === 'pr', event, title: record.title, repository },
  }
}
interface ForgeEvent { repository: string; number: number; kind: 'issue' | 'pr'; title: string; text: string; actor: string; bot: boolean; at: string; eventId: string }
function giteaEvent(payload: Record<string, unknown>, event: string, config: ForgeConfig): ForgeEvent {
  const issue = object(payload.issue), pull = object(payload.pull_request), comment = object(payload.comment)
  const resource = Object.keys(pull).length ? pull : issue
  const sender = object(payload.sender), user = object(resource.user)
  const isPr = event.startsWith('pull_request') || !!object(issue.pull_request).html_url
  return { repository: text(object(payload.repository).full_name) || config.repository, number: number(resource.number ?? payload.number),
    kind: isPr ? 'pr' : 'issue', title: text(resource.title), text: text(comment.body) || text(resource.body),
    actor: text(sender.login) || text(user.login), bot: text(sender.type) === 'Bot' || sender.bot === true,
    at: text(comment.created_at) || text(resource.updated_at) || text(object(payload.repository).updated_at),
    eventId: String(comment.id ?? resource.id ?? payload.number ?? '') }
}
function gitlabEvent(payload: Record<string, unknown>, config: ForgeConfig): ForgeEvent {
  const attributes = object(payload.object_attributes), user = object(payload.user), project = object(payload.project)
  const note = text(payload.object_kind) === 'note'
  const noteable = text(attributes.noteable_type)
  const kind: 'issue' | 'pr' = noteable === 'MergeRequest' || text(payload.object_kind) === 'merge_request' ? 'pr' : 'issue'
  return { repository: text(project.path_with_namespace) || config.repository,
    number: number(note ? attributes.noteable_iid : attributes.iid), kind,
    title: note ? '' : text(attributes.title), text: note ? text(attributes.note) : text(attributes.description),
    actor: text(user.username), bot: user.bot === true || text(user.username).endsWith('[bot]'),
    at: text(attributes.updated_at) || text(attributes.created_at) || '',
    eventId: String(attributes.id ?? payload.object_kind ?? '') }
}
function linkUrl(provider: ForgeProvider, trigger: Trigger, config: ForgeConfig): string {
  return linkUrlFor(provider, config, trigger.channel?.address.repository ?? config.repository, Number(trigger.meta.number), trigger.meta.isPr === true ? 'pr' : 'issue')
}
function linkUrlFor(provider: ForgeProvider, config: ForgeConfig, repository: string, number: number, kind: 'issue' | 'pr'): string {
  if (!config.baseUrl || !repository || !number) return ''
  const base = config.baseUrl.replace(/\/$/, '')
  return provider === GITEA ? `${base}/${repository}/${kind === 'pr' ? 'pulls' : 'issues'}/${number}`
    : `${base}/${repository}/-/${kind === 'pr' ? 'merge_requests' : 'issues'}/${number}`
}
function link(provider: ForgeProvider, address: Record<string, string>): { url: string; label: { zh: string; en: string } } {
  return { url: '', label: { zh: `${provider} #${address.number ?? ''}`, en: `${provider} #${address.number ?? ''}` } }
}
async function sendComment(provider: ForgeProvider, config: ForgeConfig, message: OutboundMessage): Promise<'sent' | 'gone'> {
  if (!config.token || !config.baseUrl) return 'gone'
  const repository = message.channel.address.repository ?? config.repository
  const number = message.channel.address.number
  const kind = message.channel.address.kind === 'pr' ? 'pr' : 'issue'
  if (!repository || !number) return 'gone'
  const base = config.baseUrl.replace(/\/$/, '')
  const path = provider === GITEA ? `/api/v1/repos/${repository}/issues/${number}/comments`
    : `/api/v4/projects/${encodeURIComponent(repository)}/${kind === 'pr' ? 'merge_requests' : 'issues'}/${number}/notes`
  const response = await fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json',
    ...provider === GITEA ? { authorization: `token ${config.token}` } : { 'private-token': config.token } }, body: JSON.stringify({ body: message.text }),
  signal: AbortSignal.timeout(30_000) })
  if (response.status === 404 || response.status === 410) return 'gone'
  if (!response.ok) throw new Error(`${provider} answered HTTP ${response.status} for ${repository}#${number}`)
  return 'sent'
}
