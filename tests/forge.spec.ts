import { describe, expect, it, vi } from 'vitest'
import { SettingsSchema } from '../src/policy.ts'
import { giteaKind, gitlabKind } from '../src/sources/forge.ts'
import { SourceRegistry } from '../src/sources/registry.ts'

const gitea = { baseUrl: 'https://git.example.com', repository: 'acme/widgets', token: 't', secret: 's', agentName: 'dsh-superagent' }
const gitlab = { baseUrl: 'https://gitlab.example.com', repository: 'group/widgets', token: 't', secret: 's', agentName: 'dsh-superagent' }
const message = (thread: string) => ({ id: 'ack:1', text: '收到', kind: 'acknowledgement' as const, channel: { source: 'gitea', thread, address: { repository: 'acme/widgets', number: '7', kind: 'issue' } } })

describe('self-hosted Git Sources', () => {
  it('turns a Gitea issue comment into a direct Thread Trigger and keeps the mention', () => {
    const trigger = giteaKind.ingress!({ text: '', meta: { event: 'issue_comment', body: {
      action: 'created', repository: { full_name: 'acme/widgets' },
      issue: { number: 7, title: 'Fix login', body: 'The page is blank', pull_request: { html_url: 'https://git.example.com/acme/widgets/pulls/7' } },
      comment: { id: 33, body: '@dsh-superagent please fix it', created_at: '2026-01-02T03:04:05Z' },
      sender: { login: 'alice', type: 'User' },
    } } }, gitea) as unknown as Record<string, unknown>
    expect(trigger).toMatchObject({ id: 'gitea:acme/widgets#7:issue_comment:33', source: 'gitea', human: true, addressed: 'mention',
      actor: { source: 'gitea', id: 'alice' }, threads: [{ source: 'gitea', id: 'acme/widgets#7' }],
      channel: { source: 'gitea', thread: 'gitea:acme/widgets#7', address: { repository: 'acme/widgets', number: '7', kind: 'pr' } },
      meta: { number: '7', isPr: true, event: 'issue_comment', repository: 'acme/widgets' } })
    expect(trigger.text).toContain('@dsh-superagent please fix it')
  })

  it('turns a GitLab merge-request note into a Trigger and marks a bot as not human', () => {
    const trigger = gitlabKind.ingress!({ text: '', meta: { event: 'Note Hook', body: {
      object_kind: 'note', project: { path_with_namespace: 'group/widgets' },
      object_attributes: { id: 44, note: 'CI says no', noteable_type: 'MergeRequest', noteable_iid: 4, updated_at: '2026-01-02T03:04:05Z' },
      user: { username: 'robot[bot]', bot: true },
    } } }, gitlab) as unknown as Record<string, unknown>
    expect(trigger).toMatchObject({ id: 'gitlab:group/widgets#4:Note Hook:44', source: 'gitlab', human: false,
      threads: [{ source: 'gitlab', id: 'group/widgets#4' }], channel: { address: { repository: 'group/widgets', number: '4', kind: 'pr' } } })
    expect(trigger.addressed).toBeUndefined()
  })

  it('starts both Sources off, and listens only once a repository is configured', () => {
    const settings = SettingsSchema.parse({})
    const sources = new SourceRegistry(() => settings)
    sources.register(giteaKind); sources.register(gitlabKind)
    expect(sources.instances().map(item => [item.id, item.enabled])).toEqual([['gitea', false], ['gitlab', false]])
    expect(giteaKind.scope!({ meta: {} }, gitea)).toEqual({ listened: true, observed: false, row: 'gitea' })
    expect(giteaKind.scope!({ meta: {} }, { ...gitea, repository: '' })).toEqual({ listened: false, reason: 'not_configured' })
  })

  it('posts a comment through the Gitea API, and calls a vanished resource gone', async () => {
    const calls: { url: string; init?: RequestInit }[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, ...init ? { init } : {} }); return new Response('', { status: calls.length === 1 ? 201 : 410 })
    }))
    try {
      await expect(giteaKind.channel!.send({} as never, message('gitea:acme/widgets#7'), gitea)).resolves.toBe('sent')
      expect(calls[0]!.url).toBe('https://git.example.com/api/v1/repos/acme/widgets/issues/7/comments')
      expect(calls[0]!.init).toMatchObject({ method: 'POST', headers: { authorization: 'token t' } })
      await expect(giteaKind.channel!.send({} as never, message('gitea:acme/widgets#7'), gitea)).resolves.toBe('gone')
      await expect(giteaKind.channel!.send({} as never, message('gitea:acme/widgets#7'), { ...gitea, token: '' })).resolves.toBe('gone')
    } finally { vi.unstubAllGlobals() }
  })

  it('posts a GitLab note on the merge request path', async () => {
    const calls: { url: string; init?: RequestInit }[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => { calls.push({ url, ...init ? { init } : {} }); return new Response('', { status: 201 }) }))
    try {
      const mr = { ...message('gitlab:group/widgets#4'), channel: { source: 'gitlab', thread: 'gitlab:group/widgets#4', address: { repository: 'group/widgets', number: '4', kind: 'pr' } } }
      await gitlabKind.channel!.send({} as never, mr, gitlab)
      expect(calls[0]!.url).toBe('https://gitlab.example.com/api/v4/projects/group%2Fwidgets/merge_requests/4/notes')
      expect(calls[0]!.init).toMatchObject({ headers: { 'private-token': 't' } })
    } finally { vi.unstubAllGlobals() }
  })
})
