# Development Guide: Target Design, Development Process and Current Implementation

> English | [中文](010-development-guide.zh.md)

> For people who will keep developing this project. It records why we split things this way, how far we have got, what is not done yet, and the constraints to respect when adding capabilities.
>
> The project is still a research prototype; "done" below refers to the level of code and automated verification, which does not mean production-ready.

---

## 1. Project goal

The original problem:

> Decouple dsh-superagent's outward communication, so that besides GitHub it can also connect to self-hosted Git repositories and other instant-messaging software; and if none of these exist, it can still be used directly through the DSH left sidebar.

The goal is not simply to "add a few more if/else branches", but to separate two dimensions:

1. **Where messages come from**: GitHub, Feishu, Gitea, GitLab, the sidebar, any IM bridge;
2. **Where code executes and how it is delivered**: GitHub repositories, local git repositories, self-hosted Git repositories.

So the core design is:

```text
external message / panel input
        │
        ▼
SourceKind (unified entry)
        │  Trigger / Thread / Channel
        ▼
Policy → Eval → Ticket
        │
        ▼
Executor (DSH Session)
        │
        ▼
CodeHost (GitHub / local git)
        │
        ▼
reply / commit / branch / PR
```

In one sentence: **the Source is responsible for "hearing", the CodeHost is responsible for "delivering".**

---

## 2. Target architecture

### 2.1 The Source side

```text
panel     github     feishu     gitea     gitlab     any IM bridge
  │          │          │          │          │            │
  └──────────┴──────────┴──────────┴──────────┴────────────┘
                         │
                  SourceRegistry
                         │
             SourceKind unified contract
                         │
        ┌────────────────┼─────────────────┐
        ▼                ▼                 ▼
     Trigger           Thread           Channel
   (one message)  (a conversation)   (a reply channel)
```

`SourceKind` is the plugin contract, located in [src/sources/kind.ts](../src/sources/kind.ts). It converges the capabilities of different platforms into optional capabilities:

- `schema` / `fields`: configuration and Settings page forms;
- `scope`: whether this message belongs to this Source, and whether it needs to be observed;
- `policy`: who may originate work;
- `channel`: how to reply;
- `ingress`: how a local or webhook message becomes a Trigger;
- `threadContext`: reads context during an Eval;
- `link`: the message's external link;
- `resource`: reads external resources;
- `find`: searches Threads;
- `textLimit`: reply length limit;
- `environment`: environment variables injected into the worker;
- `defaultEnabled`: whether it is enabled by default when it first appears.

Not every Source has to implement every capability. For example, the panel has no external resource reading, and forge has no dedicated resource pagination yet.

### 2.2 The CodeHost side

```text
                   CodeHost
                  /        \
                 /          \
        GitHub repository     local git repository
        (PR / CI / review)    (worktree / commit / push)
```

`CodeHost` is located in [src/codehost/index.ts](../src/codehost/index.ts), and there are currently only two kinds:

- `github`: keeps the existing PR, CI and review delivery path;
- `local`: creates a detached worktree, the worker commits in the worktree; when there is a writable remote, it pushes the branch with git and does not require a PR.

The core behavior of local mode:

- one worktree per Ticket;
- does not call `gh`;
- does not open a PR;
- the deliverable is a branch and a commit;
- a person reviews in the panel.

`src/deployment.ts` resolves the deployment:

```yaml
localRepository: /absolute/path/to/repo
localBranch: main
```

and detects `origin`:

```text
gitlab → gitlab
gitea  → gitea
other  → other
```

`localRepository` and a GitHub repository are mutually exclusive; setting both triggers `repositoryConflict`.

### 2.3 The domain model stays stable

All Sources are finally normalized into the existing domain objects, instead of making the upper layers know every platform:

- `Trigger`: one message entering the system;
- `Thread`: a conversation that can continue;
- `Channel`: a reply target;
- `Eval`: whether to do it, and why;
- `Ticket`: the task that actually executes.

Stable ID conventions:

| Source | Example |
| --- | --- |
| Panel | `panel:<id>` |
| Gitea | `gitea:<owner/repo>#<number>` |
| GitLab | `gitlab:<group/repo>#<iid>` |
| GitHub | `github:<number>` |
| Feishu | `feishu:<chat>:<root>` |

This way the panel, search, Ticket association and reply routing do not need a separate implementation for each platform.

### 2.4 Design principles

1. **Local first**: without GitHub or Feishu, the sidebar alone can complete one Ticket.
2. **Quiet by default**: Gitea/GitLab are off by default when they first appear; they are enabled only after a repository is configured.
3. **Explicit first**: only messages that are explicitly named or match a Policy should originate work.
4. **Platform-agnostic core**: the core only knows Trigger/Thread/Ticket, not the Gitea API.
5. **Observable**: every Source has its own health state, Settings fields and Policy section.
6. **Testable**: external platforms are tested through mock webhooks/HTTP, without depending on real accounts.
7. **Secure defaults**: webhooks must carry a secret; local mode deliberately makes `gh` fail, to avoid accidental operations on GitHub.

---

## 3. Development process

### 3.1 Starting point

Baseline commit:

```text
6337fc8 feat: add the dsh-superagent research prototype
```

The original implementation was GitHub-centric, with Feishu as an optional Source; communication, Source configuration and repository operations were strongly coupled.

### 3.2 Phase one: the Source plugin contract

Commit:

```text
f29d8b4 feat: add source plugin SDK and local git code host
```

Done:

- added `src/plugin/index.ts` and the `source-kit` export;
- the `SourceKind` capability model;
- `SourceRegistry` unified registration, configuration parsing and default-enable rules;
- `SourceIngress.meta` supports native webhook events;
- the `CodeHost` abstraction;
- `localRepository` / `localBranch`;
- local worktree creation;
- the `gh` shim fails in local mode;
- related deployment, environment and CodeHost tests.

This step means "adding a Source" no longer requires changing the core engine.

### 3.3 Phase two: the Panel Source and the sidebar

Commit:

```text
bba7afb feat: add the built-in panel source and sidebar conversation
```

Done:

- the built-in `panel` Source;
- panel messages generate a Trigger directly;
- the first panel message initializes `policy.sources.panel`;
- panel replies are written to the outbox;
- sidebar conversation UI and Thread display;
- no dependency on GitHub or Feishu.

Key files:

- [src/sources/panel.ts](../src/sources/panel.ts)
- [src/client/panel.tsx](../src/client/panel.tsx)
- [src/client/thread.tsx](../src/client/thread.tsx)

### 3.4 Phase three: Gitea, GitLab and generic IM

Commit:

```text
cb68a2d feat: add Gitea, GitLab, and generic IM ingress
```

Done:

- `src/sources/forge.ts`;
- Gitea/GitLab webhook ingress;
- Gitea HMAC `X-Gitea-Signature`;
- GitLab `X-Gitlab-Token`;
- Issue / PR / MR / comment normalized into a Trigger;
- API token replies to comments;
- both Sources are off by default;
- the bundle includes the `dsh-superagent-gitea` / `dsh-superagent-gitlab` skills;
- the panel's generic ingress `POST /orchestrator/hook`;
- panel outbound webhook;
- documentation and tests.

Key routes:

```text
POST /orchestrator/git/gitea
POST /orchestrator/git/gitlab
POST /orchestrator/hook
```

### 3.5 Phase four: on-machine install verification and compatibility fix

Commit:

```text
3c2e923 fix: recognize MainThread DSH services in the status scan
```

During actual install verification we found:

- under Node 24 the `ucomm` of the DSH process is `MainThread`;
- `scripts/dsh-superagent` only recognized `node` / `dsh`, so a service that was clearly running reported `pids: []`.

After the fix, `status` returns normally.

### 3.6 Documentation phase

Commit:

```text
ec0611b docs: add a beginner guide for dsh-superagent
```

Added [009-beginner-guide.md](009-beginner-guide.md), which explains the panel, the first message, statuses, stopping/restarting, switching repositories and common failures to a complete beginner.

---

## 4. Current implementation status

### 4.1 Overview

| Capability | Status | Notes |
| --- | --- | --- |
| `SourceKind` plugin contract | ✅ Done | Optional capabilities, shared by built-in and external Sources |
| `SourceRegistry` | ✅ Done | Registration, configuration, default enablement, sending, resource routing |
| Panel Source | ✅ Done | No external account; verified end to end |
| Generic ingress `/orchestrator/hook` | ✅ Done | Shared secret, JSON `{text, thread?, id?}` |
| Generic outbound webhook | ✅ Done | Panel replies can be forwarded to any bridge |
| `CodeHost` abstraction | ✅ Done | GitHub / local |
| Local git worktree | ✅ Done | Actually exercised with the smoke repository |
| Local-mode `gh` isolation | ✅ Done | `gh` is shimmed to fail |
| Gitea Source | ✅ Code complete | webhook + comment replies; not connected to a real instance |
| GitLab Source | ✅ Code complete | webhook + note replies; not connected to a real instance |
| Gitea/GitLab CodeHost | ❌ Not implemented | Currently only local/GitHub are supported; no MR/PR is created |
| GitHub Source | ✅ Kept | The original polling/PR path; no real GitHub this round |
| Feishu Source | ✅ Kept | The original path; no real Feishu this round |
| Gitea/GitLab skill | ✅ Done | Loaded when the Source is enabled |
| Gitea/GitLab dedicated resource | ❌ Not implemented | The existing trigger/ticket/thread resources work |
| Gitea/GitLab `find` | ⚠️ Empty implementation | Search cannot filter by forge Thread yet |
| Attachment/image bridging | ⚠️ Limited | The generic hook is text only |
| npm publishing | ❌ Not done | `private: true`, installed locally with `link:` |
| Production-grade hardening | ❌ Not done | Still a research prototype |

### 4.2 Paths actually verified

Results of the on-machine install verification:

- DSH profile: `~/.dsh/profiles/superagent`
- panel: `http://127.0.0.1:3082`
- test repository: `/home/administrator/dsh-superagent-smoke`
- a message was sent from the panel;
- it produced the `panel:install-smoke-1` Trigger;
- the Eval accepted it;
- a Ticket was created;
- the worker checked the repository read-only in a local worktree;
- automatic replies confirmed and gave the final result;
- the Ticket ended.

This proves that the main chain **panel → Trigger → Eval → Ticket → CodeHost → worker → reply** works.

Automated verification:

```text
pnpm typecheck
pnpm test     # 63 files / 1217 tests
pnpm build
```

`pnpm build` passed when the main body of P0–P5 was complete; afterwards only the service script and the documentation changed. `pnpm test` passed in full after the service script fix.

### 4.3 Parts where only the code is done, with no real-environment verification yet

- the Gitea webhook has not been connected to a real Gitea;
- the GitLab webhook has not been connected to a real GitLab;
- the GitHub Source is paused in local mode, so real GitHub polling was not verified;
- the Feishu path is kept, but the bot was not taken end to end again;
- real Gitea/GitLab token permissions, MR comments and rate limits were not verified.

---

## 5. Code map

| Path | Responsibility |
| --- | --- |
| `src/core/` | Domain model, engine, Eval, Ticket, Policy |
| `src/sources/kind.ts` | Source plugin contract |
| `src/sources/registry.ts` | Source registration, configuration, sending, resources |
| `src/sources/panel.ts` | The built-in panel Source |
| `src/sources/forge.ts` | Gitea/GitLab Source |
| `src/sources/github.ts` | The original GitHub polling |
| `src/sources/feishu.ts` | The original Feishu consumer |
| `src/codehost/index.ts` | CodeHost abstraction |
| `src/deployment.ts` | Deployment parsing, local repository, conflict checks |
| `src/app/runtime.ts` | Composition root: registers Sources, the Executor, HTTP |
| `src/app/http.ts` | Management API, webhooks, hook |
| `src/app/prompts.ts` | Session prompts, Source skills |
| `src/executor/dsh.ts` | The DSH Session executor |
| `src/client/` | DeepSeek Harness Web sidebar and management panel |
| `src/plugin/` | External Source SDK |
| `tests/` | Unit, integration, UI and service-script tests |

### 5.1 Local development commands

```sh
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

Run everything at once:

```sh
pnpm check
```

The project's tests are slow (about 1–2 minutes for the full run). While changing one module you can run only the corresponding spec, but before committing you should run the full suite.

### 5.2 Debugging DSH on this machine

The current verification uses a separate `superagent` profile and does not affect the `web` profile:

```text
~/.dsh/profiles/superagent
http://127.0.0.1:3082
```

Starting depends on `dsh` being in `PATH`. On this machine we temporarily use:

```sh
PATH=/tmp/dsh-bin:$PATH scripts/dsh-superagent start \
  --profile superagent --url http://127.0.0.1:3082
```

For long-term development, install DSH in a fixed location; do not treat `/tmp` as a runtime dependency.

---

## 6. Steps for adding a Source

### 6.1 Implement the contract

Create `src/sources/<kind>.ts` and implement at least:

```ts
export const kind: SourceKind<Config> = {
  kind: '<kind>',
  title: { zh: '', en: '' },
  description: { zh: '', en: '' },
  schema,
  fields,
  health: [],
  scope,
  policy,
  channel,
  ingress,
}
```

Add as needed:

- `threadContext`: Eval context;
- `resource`: read-only external resources;
- `link`: message links;
- `find`: search;
- `environment`: worker environment variables;
- `defaultEnabled`: whether it is on by default.

### 6.2 Do not bypass the domain model

A Source's job is to "translate":

```text
platform event → Trigger / Thread / Channel
```

Do not:

- create a Ticket directly in a Source;
- call the model directly in a Source;
- stuff platform fields into the core state;
- make the upper layers branch with `if (source === 'gitea')`.

### 6.3 Registration

Built-in Sources are registered in [src/app/runtime.ts](../src/app/runtime.ts); external Sources register through the SDK exposed by `src/plugin/index.ts`.

### 6.4 Webhook security

If it is a webhook:

- you must verify the platform signature or secret;
- compare with `crypto.timingSafeEqual`;
- do not expose an unauthenticated public endpoint directly;
- write the request headers, event types and retry behavior clearly in the design document.

### 6.5 Tests and documentation

The project has a "documentation is tests" constraint:

1. every new `src/**` module must appear in the Modules table of [007-architecture.md](007-architecture.md);
2. every `tests/*.spec.*` must appear in the Tests table;
3. every class must have JSDoc;
4. configuration changes must update [006-deployment.md](006-deployment.md);
5. new usage scenarios must update [008-cookbook.md](008-cookbook.md).

Then run:

```sh
pnpm typecheck
pnpm test
pnpm build
```

Or:

```sh
pnpm check
```

---

## 7. Development constraints and known issues

### 7.1 Constraints that must hold

- do not break the existing platform IDs: `github:`, `feishu:`, `panel:` and so on;
- do not change the code of an existing setup error unless the UI text and the tests are updated at the same time;
- `localRepository` and a GitHub repository are mutually exclusive;
- local mode does not call `gh`;
- when a Source is off it should not poll and should not produce side effects;
- a webhook without a secret should return 404/403, not accept;
- a new Source is quiet by default unless there is good reason to enable it by default.

### 7.2 Known limitations

1. **One code repository per deployment**: there is no multi-repository/multi-tenant support yet.
2. **Gitea/GitLab have no CodeHost**: they can only commit/push locally; they do not create an MR, comment on a diff or wait for CI.
3. **forge resource/find are incomplete**: paginated reads like `github/pulls/...` are not possible.
4. **Generic IM is text only**: there is no generic abstraction for images, files, emoji or quoted replies.
5. **Webhooks have no rate limiting or replay protection**: only a secret; production needs rate limiting and auditing at the proxy layer.
6. **Secrets live in the Source configuration**: this relies on DSH profile file permissions; there is no separate key management.
7. **Sensitive to the DSH version**: the current verification environment is `0.2.1-rc.2`, while the documentation examples recommend `0.2.1-rc.3`.
8. **Starting the service depends on `dsh` being in PATH**: this machine's verification used the temporary `/tmp/dsh-bin/dsh`.
9. **The npm package is not published**: `private: true`, so it can only be linked locally.
10. **Prototype code**: test coverage is fairly complete, but that does not mean production-grade reliability, security or operability.

---

## 8. Roadmap

In order of value, we recommend:

### P6: Make self-hosted Git truly deliverable

- add a Gitea/GitLab CodeHost;
- create MRs/PRs;
- comment on diffs / reviews;
- read CI status;
- handle branch protection, permissions and retries after failure;
- add end-to-end tests against real instances.

### P7: Complete forge resources and search

- `gitea/...` / `gitlab/...` paginated resources;
- Issue/MR full text, comments, diff, CI;
- `find` supports `#123`, repositories and titles;
- unify with the resource syntax of `orchestrator_read`.

### P8: Production readiness

- webhook rate limiting, replay protection, secret rotation;
- reverse proxy and HTTPS deployment templates;
- key management;
- multiple repositories/multiple deployments;
- observability, auditing and retention policies;
- npm publishing and a version compatibility matrix.

### P9: More entry points

- reference implementations of generic IM bridges;
- images/files/quoted replies;
- Feishu/GitHub regression verification;
- a more complete authorization model.

---

## 9. Key decision records

### Why split Source and CodeHost?

Because "where messages come from" and "where code is hosted" are not the same thing:

- you can talk in Feishu while the code is in GitLab;
- you can talk in a Gitea issue while the code is local;
- you can also talk only in the panel while the code is local.

If they were merged into one concept, every added platform would cause a combinatorial explosion.

### Why is the panel on by default and forge off by default?

- the panel has no external dependency and works out of the box;
- forge needs a URL, a repository, a token and a webhook; enabling it unconfigured only produces noise and errors.

### Why must local mode make `gh` fail?

The goal of local mode is "no GitHub at all". If `gh` were still available, a worker might assume it can open a PR and check CI, which makes behavior inconsistent. Making `gh` fail explicitly forces the worker onto the local delivery path.

### Why are webhook routes not subject to the same-origin restriction?

An external forge cannot carry a browser's same-origin header. So webhook routes sit outside the same-origin check, but require a platform secret:

- Gitea: HMAC-SHA256;
- GitLab: Secret Token;
- panel hook: `X-Superagent-Secret` or Bearer.

This is not "no authentication", but "a different kind of authentication".

### Why does generic IM start with a hook instead of connecting one IM directly?

Different teams use different IMs. First define a minimal protocol:

```json
{ "text": "...", "thread": "...", "id": "..." }
```

The bridge is responsible for mapping Slack/DingTalk/WeCom/an in-house IM onto this protocol. The core is not bound to any single IM.

---

## 10. Verification checklist

Before committing, at least confirm:

- [ ] new modules are added to the Modules table of `docs/007-architecture.md`
- [ ] new tests are added to the Tests table
- [ ] new classes have JSDoc
- [ ] configuration changes are written into `docs/006-deployment.md`
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes in full
- [ ] `pnpm build` passes
- [ ] no token, secret or private key has been written into the repository
- [ ] at least one real path was verified by hand (panel or the corresponding platform)

---

## 11. Related documents

- [000 Philosophy](000-philosophy.md): why it is designed this way
- [001 Domain model](001-domain.md): Trigger/Thread/Ticket
- [002 Authorization](002-authorization.md): Policy and Eval
- [003 Execution](003-execution.md): executor and delivery
- [004 Prompts](004-prompts.md): Session prompts and skills
- [005 Panel](005-panel.md): management panel
- [006 Deployment](006-deployment.md): installation, configuration and operations
- [007 Architecture](007-architecture.md): modules and test inventory
- [008 Cookbook](008-cookbook.md): common extensions
- [009 Beginner guide](009-beginner-guide.md): a complete beginner's guide to using it
