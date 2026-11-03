import { describe, expect, it, vi } from 'vitest'
import { SettingsSchema } from '../src/policy.ts'
import { panelKind } from '../src/sources/panel.ts'
import { SourceRegistry } from '../src/sources/registry.ts'
import { startRuntime } from './fixtures/host.ts'

function registry() {
  const settings = SettingsSchema.parse({})
  const sources = new SourceRegistry(() => settings)
  sources.register(panelKind)
  return { settings, sources }
}

describe('panel Source', () => {
  it('turns a locally written message into a direct Trigger and keeps its Thread when continuing', async () => {
    const { sources } = registry()
    const first = await sources.ingress('panel', { text: ' 修一下登录页的文案 ', id: 'm1' })
    expect(first).toMatchObject({
      id: 'panel:m1', source: 'panel', human: true, addressed: 'direct', text: '修一下登录页的文案',
      actor: { source: 'panel', id: 'local' }, threads: [{ source: 'panel', id: 'm1' }],
      channel: { source: 'panel', thread: 'panel:m1', address: { thread: 'm1' } },
    })
    const next = await sources.ingress('panel', { text: '顺便看看标题', id: 'm2', thread: 'panel:m1' })
    expect(next?.threads).toEqual([{ source: 'panel', id: 'm1' }])
    expect(next?.channel?.thread).toBe('panel:m1')
    expect(sources.replyWordLimit('panel')).toBe(100)
  })

  it('refuses ingress while the panel Source is off, and has no external sender to filter', async () => {
    const { settings, sources } = registry()
    settings.sources = { panel: { enabled: false, config: {} } }
    expect(await sources.ingress('panel', { text: 'still here' })).toBeUndefined()
    expect(panelKind.scope?.({ meta: {} }, { operatorName: 'Local operator', webhookUrl: '', webhookSecret: '' }))
      .toEqual({ listened: true, observed: false, row: 'panel' })
  })

  it('delivers replies to an outbound bridge webhook and treats a vanished target as gone', async () => {
    const calls: { url: string; init?: RequestInit }[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, ...init ? { init } : {} })
      return new Response('', { status: calls.length === 1 ? 200 : 410 })
    }))
    try {
      const config = { operatorName: 'Local operator', webhookUrl: 'https://bridge.example/in', webhookSecret: 's3cret' }
      const message = { id: 'panel:m1', text: 'hello', kind: 'reply' as const, channel: { source: 'panel', thread: 'panel:m1', address: { thread: 'm1' } } }
      await expect(panelKind.channel!.send({ commands: {} } as never, message, config)).resolves.toBe('sent')
      expect(calls[0]!.init).toMatchObject({ method: 'POST', headers: { authorization: 'Bearer s3cret' } })
      expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({ id: 'panel:m1', text: 'hello', thread: 'panel:m1', ticket_id: null })
      await expect(panelKind.channel!.send({ commands: {} } as never, message, config)).resolves.toBe('gone')
    } finally { vi.unstubAllGlobals() }
  })

  it('seeds the local operator and hands the first panel message to the Engine', async () => {
    const host = await startRuntime()
    try {
      const response = await host.api('POST', 'messages', { text: '请修一下登录页的文案', id: 'first' })
      expect(response.status).toBe(200)
      expect(response.body).toEqual({ trigger_id: 'panel:first', thread: 'panel:first' })
      expect(host.runtime.store.settings().policy.sources.panel).toMatchObject({ allowed: [{ id: 'local', name: 'Local operator' }] })
      expect(host.runtime.store.triggers.get('panel:first')).toMatchObject({
        source: 'panel', human: true, addressed: 'direct', text: '请修一下登录页的文案',
      })
      expect(host.runtime.store.threads.get('panel:first')?.ref).toEqual({ source: 'panel', id: 'first' })
    } finally { await host.stop() }
  })
})
