/** Panel Source: messages composed in the dsh-superagent management panel, with no external transport. */
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { SourceKind } from './kind.ts'

export const PANEL = 'panel'
/** The local operator's identity inside the panel Source; it is the only sender the panel accepts. */
export const PANEL_ACTOR = 'local'
const webhookUrl = z.string().trim().max(2000).refine(value => !value || /^https?:\/\/\S+$/.test(value), 'an http(s) URL')
const PanelConfigSchema = z.object({
  operatorName: z.string().trim().min(1).max(100).default('Local operator'),
  /** When set, replies are POSTed here so an external IM bridge can deliver them. */
  webhookUrl: webhookUrl.default(''),
  /** Shared secret an external bridge presents on inbound messages; empty disables the inbound hook. */
  webhookSecret: z.string().trim().max(200).default(''),
}).strict()
export type PanelConfig = z.infer<typeof PanelConfigSchema>
const idSchema = z.string().trim().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/)

/**
 * A Source with no remote account: a person writes in the panel, the Trigger's Channel is the panel itself, and a reply is
 * already stored as an outbox receipt. Its `ingress` is the only way a panel message becomes a Trigger.
 */
export const panelKind: SourceKind<PanelConfig> = {
  kind: PANEL,
  title: { zh: '面板', en: 'Panel' },
  description: { zh: '在 dsh-superagent 管理面板中直接对话，不需要 GitHub 或飞书。', en: 'Talk to dsh-superagent directly in its management panel, without GitHub or Feishu.' },
  schema: PanelConfigSchema,
  fields: [{ key: 'operatorName', type: 'text', label: { zh: '操作者名字', en: 'Operator name' },
    hint: { zh: '面板消息在来源中显示的名字；身份标识固定为 local。', en: 'The name panel messages show in the Source; the identity is always local.' } },
  { key: 'webhookUrl', type: 'text', label: { zh: '出站 Webhook 地址', en: 'Outbound webhook URL' },
    hint: { zh: '可选。设置后，面板回复会 POST 到这个地址，方便任意 IM 桥接器转发。', en: 'Optional. When set, panel replies are POSTed here so any IM bridge can deliver them.' } },
  { key: 'webhookSecret', type: 'text', label: { zh: '入站 Webhook 密钥', en: 'Inbound webhook secret' },
    hint: { zh: '可选。设置后，外部桥接器可以用它向 /orchestrator/hook 发送消息。留空则关闭入站。', en: 'Optional. A bridge can use it to post messages to /orchestrator/hook; empty disables inbound.' } }],
  health: [],
  scope: () => ({ listened: true, observed: false, row: 'panel' }),
  channel: {
    // The outbox receipt is the panel message; a configured webhook is the optional second transport.
    allowed: () => true,
    async send(_host, message, config) {
      if (!config.webhookUrl) return 'sent'
      const response = await fetch(config.webhookUrl, { method: 'POST',
        headers: { 'content-type': 'application/json', ...config.webhookSecret ? { authorization: `Bearer ${config.webhookSecret}` } : {} },
        body: JSON.stringify({ id: message.id, text: message.text, thread: message.channel.thread, ticket_id: message.ticketId ?? null }) })
      if (response.status === 404 || response.status === 410) return 'gone'
      if (!response.ok) throw new Error(`The panel webhook answered HTTP ${response.status}`)
      return 'sent'
    },
    link: () => ({ url: '', label: { zh: '面板', en: 'Panel' } }),
  },
  textLimit: { replyWords: 100 },
  ingress(input, config) {
    const text = input.text.trim()
    if (!text) throw new Error('A panel message is empty')
    const id = idSchema.parse((input.id ?? randomUUID()).replace(/^panel:/, ''))
    const thread = idSchema.parse((input.thread ?? id).replace(/^panel:/, ''))
    return {
      id: `panel:${id}`,
      source: PANEL,
      threads: [{ source: PANEL, id: thread }],
      actor: { source: PANEL, id: PANEL_ACTOR },
      human: true,
      // The panel is a direct conversation: a listed operator's message is explicit without a mention.
      addressed: 'direct',
      at: new Date().toISOString(),
      text,
      channel: { source: PANEL, thread: `panel:${thread}`, address: { thread } },
      meta: { thread, operator: config.operatorName },
    }
  },
  // The panel has no remote history to read; its own message is the only one an assessment needs.
  threadContext: {
    messageId: trigger => trigger.id,
    async read(_commands, trigger, part) {
      return part === 'thread'
        ? { messages: [{ id: trigger.id, from: trigger.actor.id, at: trigger.at, text: trigger.text }], body: { page: 'panel' } }
        : { messages: [], body: { page: 'panel' } }
    },
  },
  find: () => ({ threads: [], terms: [] }),
  policy: {
    schema: z.object({
      allowed: z.array(z.object({ id: z.string().trim().min(1).max(200), name: z.string().trim().max(100).optional() }).strict()).default([]),
    }).strict(),
    fields: [{ key: 'allowed', type: 'rows', label: { zh: '能通过面板发起工作的操作者', en: 'Operators who may originate work from the panel' },
      columns: [{ key: 'id', type: 'text', label: { zh: '标识', en: 'ID' } },
        { key: 'name', type: 'text', label: { zh: '名字', en: 'Name' }, optional: true }] }],
    explicit: { zh: '在面板中直接发给 dsh-superagent 的消息', en: 'A message sent directly to dsh-superagent in the panel' },
    rows: () => [{ id: 'panel', label: { zh: '面板', en: 'Panel' },
      note: { zh: '面板没有外部发送者，操作者由本地配置决定。', en: 'The panel has no remote senders; the operator is whoever uses the local panel.' },
      cells: { listedUnaddressed: true, unlistedAddressed: true, unlistedUnaddressed: true } }],
  },
}
