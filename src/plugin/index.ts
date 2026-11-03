/**
 * Public SDK for dsh-superagent Source plugins, imported as `dsh-superagent/source-kit`.
 *
 * A Source plugin registers a {@link SourceKind} on the `orchestrator` service and receives a scoped
 * {@link SourceContext}; it never imports `src/` internals or reaches the Store and Engine directly. This module is the
 * stable extension surface: the types of the protocol, its host and context, and the helpers a Source needs (commands,
 * typed KV keys, health texts, word limits and ids). The `src/sources/*` modules of this package are implementation
 * details and may move between releases.
 */
export type {
  AdmissionRowView, ChannelLink, ChannelLinks, ContextMessage, ContextPart, ContextPartName, EnvironmentInput, FieldSpec, Localized,
  SourceChannel, SourceIngress, SourceInstance, SourceKind, SourceLinkHost, SourceLinkResult, SourcePolicyPart, SourceResourceHost,
  SourceTextLimit, ThreadContext, TriggerContext, VariableSpec,
} from '../sources/kind.ts'
export type { Health, HealthCode, SourceContext, SourceHost, ThreadDescription } from '../sources/host.ts'
export { HEALTH_TEXT, health, sourceContext } from '../sources/host.ts'
export type { Commands } from '../infra/commands.ts'
export { CliError, commandError, validItems } from '../infra/commands.ts'
export type { Family, Key } from '../kv.ts'
export { family, record } from '../kv.ts'
export { checkedImText, fill, IM_WORDS, NOTE_WORDS, sameName, wordCount } from '../infra/text.ts'
export { key } from '../core/ids.ts'
export { threadKey } from '../core/model.ts'
export type { ActorRef, ChannelRef, Thread, ThreadFact, Ticket, Trigger } from '../core/model.ts'
export type { OutboundMessage, ScopeResult } from '../core/ports.ts'
export type { Deployment } from '../deployment.ts'
export type { SetupProblem } from '../setup.ts'
