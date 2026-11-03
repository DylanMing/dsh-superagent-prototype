# 开发指南：目标方案、开发过程与当前实现

> [English](010-development-guide.md) | 中文

> 面向继续开发这个项目的人。它记录我们为什么这样拆分、已经做到哪一步、哪些还没有做，以及新增能力时应该遵守的约束。
>
> 项目仍是研究原型，下面写的“已完成”指代码和自动化验证层面，不等于生产可用。

---

## 1. 项目目标

原始问题：

> 把 dsh-superagent 对外的通信解耦，使它除了 GitHub 之外，还能连接自建 Git 仓库和其他即时通信软件；如果这些都没有，也能通过 DSH 左侧栏直接使用。

目标不是简单地“再加几个 if/else”，而是把两个维度分开：

1. **消息从哪里来**：GitHub、飞书、Gitea、GitLab、侧边栏、任意 IM 桥接器；
2. **代码在哪里执行、怎么交付**：GitHub 仓库、本地 git 仓库、自建 Git 仓库。

因此核心设计是：

```text
外部消息 / 面板输入
        │
        ▼
SourceKind（统一入口）
        │  Trigger / Thread / Channel
        ▼
Policy → Eval → Ticket
        │
        ▼
Executor（DSH Session）
        │
        ▼
CodeHost（GitHub / 本地 git）
        │
        ▼
回复 / 提交 / 分支 / PR
```

一句话：**Source 负责“听见”，CodeHost 负责“落地”。**

---

## 2. 目标架构

### 2.1 Source 侧

```text
panel     github     feishu     gitea     gitlab     任意 IM 桥接
  │          │          │          │          │            │
  └──────────┴──────────┴──────────┴──────────┴────────────┘
                         │
                  SourceRegistry
                         │
              SourceKind 统一契约
                         │
        ┌────────────────┼─────────────────┐
        ▼                ▼                 ▼
     Trigger           Thread           Channel
   （一条消息）      （对话线程）      （回复通道）
```

`SourceKind` 是插件契约，位于 [src/sources/kind.ts](../src/sources/kind.ts)。它把不同平台的能力收敛为可选能力：

- `schema` / `fields`：配置和设置页表单；
- `scope`：这条消息是否属于本来源、是否需要观察；
- `policy`：谁可以发起工作；
- `channel`：怎么回复；
- `ingress`：本地或 webhook 消息怎么变成 Trigger；
- `threadContext`：评估时读取上下文；
- `link`：消息的外部链接；
- `resource`：读取外部资源；
- `find`：搜索 Thread；
- `textLimit`：回复长度限制；
- `environment`：注入 worker 的环境变量；
- `defaultEnabled`：首次出现时是否默认启用。

不是每个 Source 都必须实现全部能力。例如 panel 没有外部资源读取，forge 暂时没有专用 resource 分页。

### 2.2 CodeHost 侧

```text
                   CodeHost
                  /        \
                 /          \
        GitHub 仓库        本地 git 仓库
        （PR / CI / review） （worktree / commit / push）
```

`CodeHost` 位于 [src/codehost/index.ts](../src/codehost/index.ts)，当前只有两种：

- `github`：保留原有 PR、CI、review 交付路径；
- `local`：创建 detached worktree，worker 在 worktree 中提交；有可写 remote 时用 git 推送分支，不要求 PR。

本地模式的核心行为：

- 每个 Ticket 一个 worktree；
- 不调用 `gh`；
- 不打开 PR；
- 交付物是分支和 commit；
- 人在面板里 review。

`src/deployment.ts` 负责解析部署：

```yaml
localRepository: /absolute/path/to/repo
localBranch: main
```

并检测 `origin`：

```text
gitlab → gitlab
gitea  → gitea
其他   → other
```

`localRepository` 与 GitHub 仓库互斥；同时设置会触发 `repositoryConflict`。

### 2.3 领域模型保持稳定

所有 Source 最终都归一化为已有领域对象，而不是让上层认识每个平台：

- `Trigger`：一条进入系统的消息；
- `Thread`：可继续的对话；
- `Channel`：回复目标；
- `Eval`：是否做、为什么做；
- `Ticket`：真正执行的任务。

稳定 ID 约定：

| 来源 | 示例 |
| --- | --- |
| 面板 | `panel:<id>` |
| Gitea | `gitea:<owner/repo>#<number>` |
| GitLab | `gitlab:<group/repo>#<iid>` |
| GitHub | `github:<number>` |
| 飞书 | `feishu:<chat>:<root>` |

这样面板、搜索、任务关联和回复路由不需要为每个平台写一套。

### 2.4 设计原则

1. **本地优先**：没有 GitHub、飞书也能用侧边栏完成一次任务。
2. **默认安静**：Gitea/GitLab 首次出现默认关闭；配置仓库后才启用。
3. **显式优先**：只有被明确点名或符合 Policy 的消息才应发起工作。
4. **平台无关核心**：核心只认识 Trigger/Thread/Ticket，不认识 Gitea API。
5. **可观察**：每个 Source 有自己的健康状态、设置字段和 Policy 部分。
6. **可测试**：外部平台通过 mock webhook/HTTP 测试，不依赖真实账号。
7. **安全默认**：webhook 必须带 secret；本地模式主动让 `gh` 失败，避免误操作 GitHub。

---

## 3. 开发过程

### 3.1 起点

基线提交：

```text
6337fc8 feat: add the dsh-superagent research prototype
```

原始实现以 GitHub 为主，飞书为可选来源；通信、Source 配置和仓库操作有较强耦合。

### 3.2 第一阶段：Source 插件契约

提交：

```text
f29d8b4 feat: add source plugin SDK and local git code host
```

完成：

- 新增 `src/plugin/index.ts` 和 `source-kit` 导出；
- `SourceKind` 能力模型；
- `SourceRegistry` 统一注册、配置解析、默认启用规则；
- `SourceIngress.meta` 支持 webhook 原生事件；
- `CodeHost` 抽象；
- `localRepository` / `localBranch`；
- 本地 worktree 创建；
- 本地模式下 `gh` shim 失败；
- 相关部署、环境、CodeHost 测试。

这一步让“加一个 Source”不再需要改核心引擎。

### 3.3 第二阶段：Panel Source 与侧边栏

提交：

```text
bba7afb feat: add the built-in panel source and sidebar conversation
```

完成：

- 内置 `panel` Source；
- 面板消息直接生成 Trigger；
- 第一条 panel 消息初始化 `policy.sources.panel`；
- 面板回复写入 outbox；
- 侧边栏会话 UI、Thread 展示；
- 不依赖 GitHub 或飞书。

关键文件：

- [src/sources/panel.ts](../src/sources/panel.ts)
- [src/client/panel.tsx](../src/client/panel.tsx)
- [src/client/thread.tsx](../src/client/thread.tsx)

### 3.4 第三阶段：Gitea、GitLab 与通用 IM

提交：

```text
cb68a2d feat: add Gitea, GitLab, and generic IM ingress
```

完成：

- `src/sources/forge.ts`；
- Gitea/GitLab webhook 入站；
- Gitea HMAC `X-Gitea-Signature`；
- GitLab `X-Gitlab-Token`；
- Issue / PR / MR / comment 归一化为 Trigger；
- API token 回复评论；
- 两个 Source 默认关闭；
- bundle 中加入 `dsh-superagent-gitea` / `dsh-superagent-gitlab` skill；
- panel 通用入站 `POST /orchestrator/hook`；
- panel 出站 webhook；
- 文档、测试。

关键路由：

```text
POST /orchestrator/git/gitea
POST /orchestrator/git/gitlab
POST /orchestrator/hook
```

### 3.5 第四阶段：本机安装验证与兼容性修复

提交：

```text
3c2e923 fix: recognize MainThread DSH services in the status scan
```

实际安装验证时发现：

- Node 24 下 DSH 进程的 `ucomm` 是 `MainThread`；
- `scripts/dsh-superagent` 只识别 `node` / `dsh`，导致服务明明在运行却报告 `pids: []`。

修复后 `status` 正常返回。

### 3.6 文档阶段

提交：

```text
ec0611b docs: add a beginner guide for dsh-superagent
```

新增 [009 新手指南](009-beginner-guide.zh.md)，面向完全新手解释面板、第一条消息、状态、停止/重启、切换仓库和常见故障。

---

## 4. 当前实现程度

### 4.1 总览

| 能力 | 状态 | 说明 |
| --- | --- | --- |
| `SourceKind` 插件契约 | ✅ 已完成 | 可选能力，内置和外部 Source 共用 |
| `SourceRegistry` | ✅ 已完成 | 注册、配置、默认启用、发送、资源路由 |
| Panel Source | ✅ 已完成 | 无外部账号；已做端到端验证 |
| 通用入站 `/orchestrator/hook` | ✅ 已完成 | 共享 secret，JSON `{text, thread?, id?}` |
| 通用出站 webhook | ✅ 已完成 | 面板回复可转到任意桥接器 |
| `CodeHost` 抽象 | ✅ 已完成 | GitHub / local |
| 本地 git worktree | ✅ 已完成 | 已用 smoke 仓库实际跑通 |
| 本地模式 `gh` 隔离 | ✅ 已完成 | `gh` 被 shim 为失败 |
| Gitea Source | ✅ 代码完成 | webhook + 评论回复；未接真实实例 |
| GitLab Source | ✅ 代码完成 | webhook + note 回复；未接真实实例 |
| Gitea/GitLab CodeHost | ❌ 未实现 | 目前只支持 local/GitHub；不会创建 MR/PR |
| GitHub Source | ✅ 保留 | 原有轮询/PR 路径；本轮未接真实 GitHub |
| 飞书 Source | ✅ 保留 | 原有路径；本轮未接真实飞书 |
| Gitea/GitLab skill | ✅ 已完成 | Source 启用时加载 |
| Gitea/GitLab 专用 resource | ❌ 未实现 | 现有 trigger/ticket/thread 资源可用 |
| Gitea/GitLab `find` | ⚠️ 空实现 | 搜索暂不能按 forge Thread 过滤 |
| 附件/图片桥接 | ⚠️ 有限 | 通用 hook 只有文本 |
| npm 发布 | ❌ 未完成 | `private: true`，本地 `link:` 安装 |
| 生产级安全加固 | ❌ 未完成 | 仍是研究原型 |

### 4.2 已经实际验证的路径

本机安装的验证结果：

- DSH profile：`~/.dsh/profiles/superagent`
- 面板：`http://127.0.0.1:3082`
- 测试仓库：`/home/administrator/dsh-superagent-smoke`
- 从面板发送消息；
- 生成 `panel:install-smoke-1` Trigger；
- Eval 接受；
- Ticket 创建；
- worker 在本地 worktree 中只读检查仓库；
- 自动回复确认和最终结果；
- Ticket 结束。

这证明 **panel → Trigger → Eval → Ticket → CodeHost → worker → reply** 主链路可用。

自动化验证：

```text
pnpm typecheck
pnpm test     # 63 files / 1217 tests
pnpm build
```

`pnpm build` 在 P0–P5 主体完成时通过；后续只改了 service 脚本和文档。`pnpm test` 在 service 脚本修复后全量通过。

### 4.3 只完成代码、尚未完成真实环境验证的部分

- Gitea webhook 没有接真实 Gitea；
- GitLab webhook 没有接真实 GitLab；
- GitHub Source 在本地模式下被暂停，没有验证真实 GitHub 轮询；
- 飞书路径保留，但没有重新做机器人端到端；
- Gitea/GitLab 的真实 token 权限、MR 评论、限流未验证。

---

## 5. 代码地图

| 路径 | 职责 |
| --- | --- |
| `src/core/` | 领域模型、引擎、Eval、Ticket、策略 |
| `src/sources/kind.ts` | Source 插件契约 |
| `src/sources/registry.ts` | Source 注册、配置、发送、资源 |
| `src/sources/panel.ts` | 内置面板 Source |
| `src/sources/forge.ts` | Gitea/GitLab Source |
| `src/sources/github.ts` | 原有 GitHub 轮询 |
| `src/sources/feishu.ts` | 原有飞书 Consumer |
| `src/codehost/index.ts` | CodeHost 抽象 |
| `src/deployment.ts` | 部署解析、本地仓库、冲突检查 |
| `src/app/runtime.ts` | 组合根：注册 Source、Executor、HTTP |
| `src/app/http.ts` | 管理 API、webhook、hook |
| `src/app/prompts.ts` | Session prompt、Source skill |
| `src/executor/dsh.ts` | DSH Session 执行器 |
| `src/client/` | DSH Web 侧边栏与管理面板 |
| `src/plugin/` | 外部 Source SDK |
| `tests/` | 单元、集成、UI、服务脚本测试 |

### 5.1 本地开发命令

```sh
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

一次跑完：

```sh
pnpm check
```

项目测试较慢（全量约 1–2 分钟），改一个模块时可以只跑对应 spec，但提交前应跑全量。

### 5.2 本机 DSH 调试

当前验证使用独立的 `superagent` profile，不影响 `web` profile：

```text
~/.dsh/profiles/superagent
http://127.0.0.1:3082
```

启动依赖 `dsh` 在 `PATH` 中。本机临时使用：

```sh
PATH=/tmp/dsh-bin:$PATH scripts/dsh-superagent start \
  --profile superagent --url http://127.0.0.1:3082
```

长期开发建议把 DSH 安装到固定位置，不要把 `/tmp` 当成运行时依赖。

---

## 6. 新增一个 Source 的步骤

### 6.1 实现契约

新建 `src/sources/<kind>.ts`，实现至少：

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

按需要增加：

- `threadContext`：评估上下文；
- `resource`：只读外部资源；
- `link`：消息链接；
- `find`：搜索；
- `environment`：worker 环境变量；
- `defaultEnabled`：默认是否开启。

### 6.2 不要绕过领域模型

Source 的职责是“翻译”：

```text
平台事件 → Trigger / Thread / Channel
```

不要：

- 在 Source 里直接创建 Ticket；
- 在 Source 里直接调用模型；
- 把平台字段塞进核心状态；
- 让上层通过 `if (source === 'gitea')` 分支处理。

### 6.3 注册

内置 Source 在 [src/app/runtime.ts](../src/app/runtime.ts) 注册；外部 Source 通过 `src/plugin/index.ts` 暴露的 SDK 注册。

### 6.4 webhook 安全

如果是 webhook：

- 必须校验平台签名或 secret；
- 使用 `crypto.timingSafeEqual` 比较；
- 不要把无鉴权的公网入口直接暴露；
- 在设计文档中写清请求头、事件类型和重试行为。

### 6.5 测试与文档

项目有“文档即测试”的约束：

1. 每个 `src/**` 新模块必须出现在 [007 架构](007-architecture.zh.md) 的「模块」表；
2. 每个 `tests/*.spec.*` 必须出现在「测试」表；
3. 每个 class 必须有 JSDoc；
4. 配置变化要更新 [006 部署](006-deployment.zh.md)；
5. 新增使用场景要更新 [008 实操手册](008-cookbook.zh.md)。

然后运行：

```sh
pnpm typecheck
pnpm test
pnpm build
```

或者：

```sh
pnpm check
```

---

## 7. 开发约束与已知问题

### 7.1 必须保持的约束

- 不破坏已有平台 ID：`github:`、`feishu:`、`panel:` 等；
- 不改变已有 setup 错误的 code，除非同时更新 UI 文案和测试；
- `localRepository` 与 GitHub 仓库互斥；
- 本地模式不调用 `gh`；
- Source 关闭时不应轮询、不应产生副作用；
- webhook 无 secret 时应返回 404/403，而不是接受；
- 新 Source 默认 quiet，除非有充分理由默认开启。

### 7.2 已知限制

1. **一个部署一个代码仓库**：当前没有多仓库/多租户。
2. **Gitea/GitLab 没有 CodeHost**：只能本地提交/推送；不会创建 MR、评论 diff 或等待 CI。
3. **forge resource/find 不完整**：不能用 `github/pulls/...` 那样的分页读取。
4. **通用 IM 只有文本**：没有图片、文件、表情、引用回复的通用抽象。
5. **webhook 没有限流/重放保护**：只有 secret；生产环境需要代理层限流和审计。
6. **secret 存在 Source 配置中**：依赖 DSH profile 文件权限，未做独立密钥管理。
7. **DSH 版本敏感**：当前验证环境是 `0.2.1-rc.2`，文档示例推荐 `0.2.1-rc.3`。
8. **服务启动依赖 `dsh` 在 PATH**：本机验证使用了临时 `/tmp/dsh-bin/dsh`。
9. **npm 包未发布**：`private: true`，只能本地 link。
10. **原型代码**：测试覆盖较全，但不代表生产级可靠性、安全性和可运维性。

---

## 8. 后续路线

按价值排序，建议：

### P6：让自建 Git 真正可交付

- 增加 Gitea/GitLab CodeHost；
- 创建 MR/PR；
- 评论 diff / review；
- 读取 CI 状态；
- 处理分支保护、权限和失败重试；
- 补真实实例的端到端测试。

### P7：补齐 forge 的资源与搜索

- `gitea/...` / `gitlab/...` 分页资源；
- Issue/MR 全文、评论、diff、CI；
- `find` 支持 `#123`、仓库、标题；
- 与 `orchestrator_read` 的资源语法统一。

### P8：生产化

- webhook 限流、重放保护、secret 轮换；
- 反向代理与 HTTPS 部署模板；
- 密钥管理；
- 多仓库/多部署；
- 可观测性、审计和保留策略；
- npm 发布与版本兼容矩阵。

### P9：更多入口

- 通用 IM 桥接器参考实现；
- 图片/文件/引用回复；
- 飞书/GitHub 回归验证；
- 更完整的权限模型。

---

## 9. 关键决策记录

### 为什么拆 Source 和 CodeHost？

因为“消息来源”和“代码托管”不是一回事：

- 可以在飞书里说话，但代码在 GitLab；
- 可以在 Gitea issue 里说话，但代码在本地；
- 也可以只在面板里说话，代码在本地。

如果合成一个概念，每加一个平台都会产生组合爆炸。

### 为什么 panel 默认开启，forge 默认关闭？

- panel 无外部依赖，开箱即用；
- forge 需要 URL、仓库、token、webhook，未配置时开启只会产生噪音和错误。

### 为什么本地模式要让 `gh` 失败？

本地模式的目标是“完全不需要 GitHub”。如果 `gh` 仍然可用，worker 可能误以为可以开 PR、查 CI，导致行为不一致。让 `gh` 明确失败，可以迫使 worker 走本地交付路径。

### 为什么 webhook 路由不受同源限制？

外部 forge 不可能带浏览器的同源头。因此 webhook 路由单独放在同源检查之外，但要求平台 secret：

- Gitea：HMAC-SHA256；
- GitLab：Secret Token；
- panel hook：`X-Superagent-Secret` 或 Bearer。

这不是“无鉴权”，而是“换一种鉴权”。

### 为什么通用 IM 先做 hook，而不是直接接某个 IM？

不同团队的 IM 不同。先定义最小协议：

```json
{ "text": "...", "thread": "...", "id": "..." }
```

桥接器负责把 Slack/钉钉/企业微信/自研 IM 映射到这个协议。核心不绑定任何一个 IM。

---

## 10. 验证清单

提交前至少确认：

- [ ] 新增模块已加入 `docs/007-architecture.zh.md` 的「模块」表
- [ ] 新增测试已加入「测试」表
- [ ] 新增 class 有 JSDoc
- [ ] 配置变化已写入 `docs/006-deployment.zh.md`
- [ ] `pnpm typecheck` 通过
- [ ] `pnpm test` 全量通过
- [ ] `pnpm build` 通过
- [ ] 没有把 token、secret、私钥写进仓库
- [ ] 手动验证至少一条真实路径（panel 或对应平台）

---

## 11. 相关文档

- [000 Philosophy](000-philosophy.zh.md)：为什么这样设计
- [001 Domain model](001-domain.zh.md)：Trigger/Thread/Ticket
- [002 Authorization](002-authorization.zh.md)：Policy 与 Eval
- [003 Execution](003-execution.zh.md)：执行器与交付
- [004 Prompts](004-prompts.zh.md)：Session prompt 与 skill
- [005 Panel](005-panel.zh.md)：管理面板
- [006 Deployment](006-deployment.zh.md)：安装、配置、运维
- [007 Architecture](007-architecture.zh.md)：模块与测试清单
- [008 Cookbook](008-cookbook.zh.md)：常见扩展
- [009 Beginner guide](009-beginner-guide.zh.md)：完全新手使用指南
