import { describe, expect, it } from 'vitest'
import { family, health, IM_WORDS, key, record, threadKey, wordCount } from '../src/plugin/index.ts'

describe('source plugin SDK', () => {
  it('exports the helpers a Source needs without host internals', () => {
    expect(key('a', 'b')).toBe(key('a', 'b'))
    expect(key('a', 'b')).toHaveLength(32)
    expect(threadKey({ source: 'panel', id: '1' })).toBe('panel:1')
    const messages = family<string, [string]>('demo:')
    expect(messages('a')).toBe('demo:a')
    expect(messages.prefix).toBe('demo:')
    expect(record<number>('n')).toBe('n')
    expect(wordCount('hello world')).toBe(2)
    expect(IM_WORDS).toBe(100)
    expect(health('ready', 'sourceOff')).toMatchObject({ state: 'ready', detail: 'Off' })
  })
})
