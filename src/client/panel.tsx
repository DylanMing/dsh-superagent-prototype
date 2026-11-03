/** Panel conversation composer: the only UI that turns a locally written message into a Source Trigger. */
import { useState } from 'react'
import { Button, Icon } from './controls.tsx'
import { useAction, usePanel } from './provider.tsx'

/**
 * Writes a message into a panel Thread, or starts one when `thread` is omitted.
 * `onSent` runs after the host accepts the message, with the Thread key the host returned.
 */
export function PanelComposer({ thread, placeholder, onSent }: { thread?: string
  placeholder?: string; onSent?: (thread: string) => void | Promise<void> }) {
  const { t, call } = usePanel()
  const [text, setText] = useState('')
  const send = useAction(async () => {
    const result = await call('POST messages', { body: { text, ...(thread ? { thread } : {}) } })
    setText('')
    await onSent?.(result.thread)
  })
  const submit = () => { if (text.trim() && !send.busy) void send.run() }
  return <div className="dt-composer">
    <textarea className="dt-textarea" rows={3} value={text} placeholder={placeholder ?? t('panelPlaceholder')}
      aria-label={placeholder ?? t('panelPlaceholder')} onChange={event => setText(event.target.value)}
      onKeyDown={event => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); submit() } }} />
    <div className="dt-composer-actions">
      <span className="dt-hint">{t('panelSendHint')}</span>
      <Button variant="primary" icon={<Icon name="message" />} disabled={!text.trim() || send.busy} aria-busy={send.busy}
        onClick={submit}>{t('panelSend')}</Button>
    </div>
  </div>
}
