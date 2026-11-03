# 006 部署

> [English](006-deployment.md) | 中文

本指南用于安装、配置和运维 dsh-superagent。它涵盖账号、启动检查、升级和故障排查，并建立在 [001 领域模型](001-domain.zh.md) 到 [005 面板](005-panel.zh.md) 的基础之上。

## 运行哪些组件

- **一个专用的 DeepSeek Harness profile**，本指南中称为 `superagent`。请从 Web profile 模板创建它。它加载 bundle，并在 `127.0.0.1` 上提供其面板。请把它与你日常使用的 profile 分开：该插件会修改进程级的 `PATH` 和 git 设置，并且其进程需要独立重启和升级。
- **一个智能体 GitHub 账号。** 智能体以该账号发表评论、推送分支并创建 pull request，所用 GitHub CLI 仅以该账号登录。
- **可选：** 用于聊天请求的 Feishu 机器人。

插件配置保存状态目录和机器级限制。其余一切都通过面板设置：Sources 用于仓库和账号，Policy 用于允许列表，Execution 用于 worker 目录和命令。

### 权限与隔离

bundle 定义了供执行器使用的 `dsh-superagent-worker` 和供主会话使用的 `dsh-superagent-router`。它们会出现在 DeepSeek Harness 的预设列表中，但仅供 dsh-superagent 使用。不要把它们选作个人会话的预设，也不要禁用它们的配置行。应用需要它们来创建和恢复自己的会话。

在 Web UI 中打开一个空白的受管会话时，可能会选中该 profile 的默认预设。dsh-superagent 会在第一个回合开始前恢复其角色专属的预设。

两个预设都以操作者的 OS 用户身份、以 `danger-full-access` 运行，并从订阅的对话线程读取消息。账号包装器默认只选择智能体的凭据，它们并不隔离进程。worker 可以按路径执行程序，也可以读取操作者的主目录。若需要隔离，请使用仅包含智能体凭据的专用 OS 账号。

## 前置条件

- Node.js 22.19+ 或 24+、pnpm、git 2.32+、Python 3.8+ 以及 tmux
- GitHub CLI（`gh`）2.48 或更高版本。Source 的 CLI 字段必须指向 `gh` 或 `lark-cli` 包装器；宿主依赖它们的子命令和输出格式。
- github.com 上的一个仓库；不支持 GitHub Enterprise Server。若要为每个任务创建一个检出目录，请保留一份本地克隆，prepare 命令可以从其中添加 worktree。如果该仓库使用 Git LFS，请安装 `git-lfs`。
- 为 DeepSeek Harness 配置的模型提供方。除非评估或执行设置另行指定，dsh-superagent 使用该 profile 的默认模型。
- 使用 Feishu 时需要：`lark-cli`（已在 1.0.90 上测试），以及一个带机器人的 Feishu 或 Lark 应用

## 账号

### 智能体 GitHub 账号

1. 为智能体创建一个 GitHub 用户账号，并授予该仓库的写权限。GitHub App 不能充当智能体，因为 dsh-superagent 需要读取该账号的通知。
2. 为它提供一个只使用自身凭据的 GitHub CLI：

   ```sh
   mkdir -p ~/.local/bin
   cat > ~/.local/bin/gh-agent <<'EOF'
   #!/bin/sh
   GH_CONFIG_DIR="$HOME/.config/gh-agent" exec gh "$@"
   EOF
   chmod +x ~/.local/bin/gh-agent
   gh-agent auth login
   gh-agent api user --jq .login
   ```

   以智能体账号登录；最后一条命令会打印其 login。dsh-superagent 以相同方式读取该 login。

### Feishu 机器人（可选）

1. 创建一个具备机器人能力的自建应用。授予它接收消息事件、读取和发送聊天消息、读取聊天成员的权限，然后发布应用版本。
2. 为机器人提供独立的 `lark-cli` 配置，限定为机器人身份，并创建一个包装器：

   ```sh
   LARKSUITE_CLI_CONFIG_DIR="$HOME/.lark-cli-dsh-superagent" lark-cli config init --app-id <cli_…> --app-secret-stdin
   LARKSUITE_CLI_CONFIG_DIR="$HOME/.lark-cli-dsh-superagent" lark-cli config strict-mode bot --global
   cat > ~/.local/bin/lark-bot <<'EOF'
   #!/bin/sh
   export LARKSUITE_CLI_CONFIG_DIR="$HOME/.lark-cli-dsh-superagent"
   exec lark-cli "$@"
   EOF
   chmod +x ~/.local/bin/lark-bot
   ```

   第一条命令从标准输入读取应用密钥。请使用一个独立的配置目录：`lark-cli` 每个 app id 只允许一个 profile，而你的个人配置可能已经包含该应用的用户登录。

   宿主会拒绝能够以用户身份操作的 CLI。它从机器人配置中读取 app id、Feishu/Lark 品牌和机器人的 `open_id`。

   两份配置共享应用密钥的钥匙串条目。若只想移除机器人配置，请删除其目录；不要运行 `lark-cli config remove`，那会影响共享的密钥。

## 安装

在一台尚无 `superagent` profile 的机器上，只需运行下面这段一次：

```sh
npm install -g @deepseek-ai/dsh@0.2.1-rc.3
git clone <this repository> dsh-superagent && cd dsh-superagent
pnpm install && pnpm build
dsh superagent --from-default-profile web --dump-config > /dev/null
dsh plugin --profile superagent add "link:$PWD"
```

上面固定的版本是公开版本；其他版本必须满足 `package.json` 中的 `engines.dsh`。

第四条命令基于 DeepSeek Harness Web 模板创建 `~/.dsh/profiles/superagent`。第五条安装本 bundle。设置 `DSH_HOME` 可以改变默认的 `~/.dsh` 目录位置。

仅在全新安装时运行创建 profile 的命令。如果 profile 已存在，该命令会替换它并删除其 `cordis.patch.yml`，包括机器配置。升级时不要使用它。

## 机器配置

把 [examples/profile.cordis.patch.yml](../examples/profile.cordis.patch.yml) 复制到 `~/.dsh/profiles/superagent/cordis.patch.yml` 以替换该文件，并替换其中每个 `<placeholder>`。使用 Feishu 时，还需在那里启用 `dsh-superagent-feishu` 条目。`webserver` 条目设置面板的端口。

| 键 | 是否必需 | 含义 |
| --- | --- | --- |
| `stateDir` | 是 | 绝对路径：数据库、锁、`worker-bin` 中的命令 shim、智能体的 git 配置，以及默认情况下 `work` 中的任务目录。升级前请备份 |
| `promptMaxChars`、`admissionContextMaxPages`、`admissionContextTimeoutMs` | 否 | 保存的提示词配置的最大长度，以及一次评估在多少时间内读取多少个对话线程页面 |
| `localRepository`、`localBranch` | 否 | 要在其中工作的本地 git 仓库绝对路径，以及每个任务 worktree 的起点 ref（为空表示其 `HEAD`）。请**代替** GitHub Source 的仓库来设置它；两者同时设置会导致安装配置被拒绝。需重启后生效 |

首次启动后，可在 **Settings → Deployment** 或 DeepSeek Harness 插件管理器中编辑机器级限制。修改无需重启即可生效。`stateDir`、`localRepository` 和 `localBranch` 无法在那里修改。无效的值或未知的配置键会阻止启动；日志会指出是哪个键。

本地仓库不需要 GitHub 账号或 `gh`。worker 会在任务目录下获得一个分离的 worktree，在其中提交，并以分支和提交报告就绪；由人在面板中审查该改动。`gh` 被 shim 为必定失败，提示词也把 pull request 交付替换为本地提交。若要针对自建仓库工作，可将 `localRepository` 指向一个 `origin` 为 GitLab、Gitea 或其他 git 主机的克隆；当该远程可写时，worker 用 git 推送分支，无需任何托管 API 或 pull request。

## 自建 Git 与通用 IM

Gitea 和 GitLab 是 **Sources** 中的可选 Source 类型；两者初始都没有仓库。配置站点 URL、仓库、用于回复的 API token、webhook 密钥以及智能体账号名。该类型会把 issue、merge request 和评论转换为任务；只有当消息中提及所配置的智能体名称时，该消息才是显式请求。启用某一类型还会让其会话获得内置的 Gitea 或 GitLab 技能，该技能说明如何在不使用 `gh` 的情况下读取工单并发布回复。

在 forge 上注册 webhook，指向本宿主：

| 提供方 | URL | 密钥头 | 事件 |
| --- | --- | --- | --- |
| Gitea | `/orchestrator/git/gitea` | `X-Gitea-Signature`，用所配置的密钥对请求体计算 HMAC-SHA256 | Issues, Issue Comment, Pull Request |
| GitLab | `/orchestrator/git/gitlab` | `X-Gitlab-Token`，即所配置的 Secret Token | Issue, Note, Merge request |

DSH Web 服务器只监听回环地址：请在其前面放一个反向代理，或把提供方的 webhook 转发到该回环地址。除面板的同源检查外，密钥是唯一的门禁，因此请保密，并在代理处使用 HTTPS。

面板可以充当任意 IM 桥接器。设置 **Outbound webhook URL** 后，每条面板回复都会以 `{id, text, thread, ticket_id}` 发送给该地址（可选的 **Inbound webhook secret** 会作为 `Authorization: Bearer` 发送）。设置 **Inbound webhook secret** 后，即可在 `POST /orchestrator/hook` 接收消息，请求头为 `X-Superagent-Secret`，JSON 请求体为 `{text, thread?, id?}`；IM 桥接器可以把自己的会话映射到 `thread`。任一密钥留空即关闭该方向。

## 启动与停止

```sh
scripts/dsh-superagent start
scripts/dsh-superagent status
```

`start` 在 tmux 会话 `dsh-superagent`（其他 profile 则为 `dsh-<profile>`）中运行 `dsh --profile superagent`。它最多等待一分钟，直到运行时就绪或报告某项安装需求。首次运行时，它会打印缺失的安装信息。它会拒绝重复实例，包括在本脚本之外启动的实例。

`stop` 和 `restart` 请求优雅关闭，并最多等待执行器五分钟。它们从不强制杀死进程，也不会触碰其他 tmux 会话。

`status` 打印进程 id、健康状态和安装问题。对于其他 profile 或端口，使用 `--profile` 和 `--url`，或设置 `DSH_SUPERAGENT_PROFILE` 与 `DSH_SUPERAGENT_URL`。

`status`、`start` 和 `restart` 会以四种退出码之一结束：

| 退出码 | 含义 |
| --- | --- |
| 0 | 服务正常运行 |
| 1 | 未运行、运行了两份、无响应，或其运行时报告错误；重启可能修复 |
| 2 | 正在运行，但除运行时之外的某一部分（例如某个 Source 或 Policy 同步 `sync:<source id>`）报告错误；重启无法修复 |
| 3 | 正在运行并等待安装配置；重启无法修复 |

仍在启动中的 Source 视为正常运行。安装配置无法检查的 Feishu 机器人同样如此。

`status` 在 `errors` 下返回失败的部分及其详情，在 `setup` 下返回安装需求。`start` 和 `restart` 会把这些问题逐行打印出来；如果服务始终无法起来，它们以 1 退出。只有主动执行的 `stop` 会暂停自动恢复。

每个 profile 把日志和控制文件存放在 `.artifacts/` 下：

- 启动日志：`dsh-superagent-<profile>-<date>-<time>-<pid>.log`，其中 pid 属于该脚本。保留最新的 20 个。
- 控制文件：`control/profiles/<profile>/`，包含停止标记、锁和进程 id。

打开日志中打印的 URL，然后在侧边栏选择 **Superagent**。

### 每小时检查

请在平常使用的 DeepSeek Harness profile 中创建这个每小时检查，而不是在 `superagent` 中。它必须在智能体服务停止时仍持续运行。请让该 profile 中的智能体用下面的提示词创建每小时计划，并填入检出路径：

```text
检查 dsh-superagent：在 <checkout> 中运行 `scripts/dsh-superagent --profile superagent status`。退出码 0：什么都不做，也不要说话。退出码 2：不要重启；把 `errors` 下的每一部分及其详情告诉我，除非你已经告诉过我相同的部分。退出码 3：不要重启；把 `setup` 所说的安装需求告诉我，除非你已经告诉过我。如果它报告 manually_stopped: true，就让它保持停止。否则（退出码 1）运行 `scripts/dsh-superagent --profile superagent --respect-stop restart`，它的退出方式相同：0 表示已恢复，那就不要说话；2 和 3 按上面的方式报告；如果它以 1 退出或以其他方式失败，读取最新的 .artifacts/dsh-superagent-superagent-*.log 以及 docs/006-deployment.zh.md 的「故障排查」一节，修复你能修复的问题，并告诉我出了什么问题、你做了什么。
```

`--respect-stop` 会保留主动停止。只有 `stop` 写入该标记；`start` 清除它。`restart` 不写标记，因此该检查可以恢复一次关闭超时的重启。

## 设置

在轮询或开始工作之前，安装配置必须成功。Overview 会列出缺失的需求，并链接到相应设置。更改设置会重新运行安装配置。如果你在应用之外修复了某些内容（例如 CLI 认证），请选择 **Check again**。

1. **Sources。** 设置 GitHub 仓库（`owner/name`）和智能体 CLI，例如 `/home/me/.local/bin/gh-agent`。请求通常通过智能体账号的通知到达。提及该账号的新 issue 或新评论会在下一次轮询时到达；而在已有 issue 正文中编辑加入提及则不会。请改为发布一条新评论。使用 Feishu 时，设置机器人 CLI、聊天、每个聊天的接收全部或仅提及模式，以及是否接收私信。
2. **Policy。** 两条示例规则可以编辑或删除。在 **On each Source** 下，添加可以发起工作的 GitHub 账号和 Feishu 用户；在某个列表里有人之前，任何请求都无法成为任务。使用 Feishu 时，可以选择一个聊天，在启动时以及点击 **Sync now** 时从该聊天同步列表。
3. **Execution。** 目录根和 prepare 命令。要让每个任务都获得该仓库的一份检出：

   ```sh
   git -C /home/me/src/widgets fetch --no-tags "https://github.com/$DSH_SUPERAGENT_GITHUB_REPOSITORY.git" "${DSH_SUPERAGENT_GITHUB_PR_HEAD:-HEAD}:refs/dsh-superagent/$DSH_SUPERAGENT_TICKET" &&
   git -C /home/me/src/widgets worktree add -b "agent/$DSH_SUPERAGENT_NAME" "$DSH_SUPERAGENT_DIR" "refs/dsh-superagent/$DSH_SUPERAGENT_TICKET"
   ```

   把个人 CLI（例如登录到你本人账号的那个）列为被阻止的命令。
4. **Prompts。** 设置团队部分：GitHub 披露行、审查机器人、提交作者和自动合并条件。

### 管理 API

面板使用一个本地 HTTP API，智能体也可以调用它。`SETUP.zh.md` 用它保存设置，服务脚本则读取 `GET state`。

把请求发送到 `http://127.0.0.1:<port>/orchestrator/api/`，并带上 `x-orchestrator-request: 1`。Host 必须是 `127.0.0.1:<port>` 或 `localhost:<port>`。缺少请求头，或 `Origin` 来自其他站点，会收到 403。

通过 API 保存具有与面板相同的权限。与通过主会话工具进行的保存不同，它们可以更改执行环境和安装配置的账号字段。

智能体可以依赖以下路由和字段。`src/app/api.ts` 中的其他路由为面板服务，并随面板变化。

| 请求 | 应答 |
| --- | --- |
| `GET state` | 每个页面读取的内容：`setup`，含 `problem` 和 `feishuProblem`，各自为 `null` 或一个安装问题（含 `place`、`code`、`values` 和 `detail`），以及安装配置解析出账号后的 `accounts`；`health`，下面按部分逐条列出，含 `state`（`starting`、`ready`、`paused` 或 `error`）、`detail` 和 `at`；`load`，即执行器会话的 `running`、任务的 `queued` 和 `maxWorkers`；`paused`；以及 `masterId` |
| `GET settings` | `blocks`：`policy`、`eval` 和 `executor`，各含其 `value` 和 `revision`；`sources`：Source 实例，各含 `id`、`kind`、`installed`、其 block 的 `value`（`{"enabled": …, "config": {…}}`）和 `revision`、其类型对应的表单，以及（若存在）其安装 `problem`；`policyVersion`；以及 `environment`，即执行环境的 `root` 和 `variables` |
| `GET sources` | 每个 Source 的状态：`state`（`missing`、`off`、`error`、`setup`、`starting`、`paused` 或 `ready`）、其各部分的 `health`、其安装 `problem`、最近一天的 `stats`、该天内被其 `filtered` 的触发，以及该天内被其 `dropped` 的消息（最新丢弃的在前），每条含 `channel`、`preview`、`ticket`（`id` 和 `title`，若该消息属于某个任务）、`thread`（若存储中有），以及 `dropped.at` 和 `dropped.reason`、`channelGone` 或 `channelIgnored` |
| `PUT settings/<block>` 带 `{"value": …, "revision": n}` | 保存一个 block：`saved`、该 block 的新 `revision`、`policy_changed` 和 `restarting`。`value` 是整个 block，与 `GET settings` 中的一致；缺失的键取其默认值 |
| `POST executor/pause` 带 `{"paused": true}` 或 `false` | 暂停或恢复处理：`paused` |
| `POST setup/check` | 通过重启 dsh-superagent 重新运行安装配置：`restarting: true`。当安装配置没有需要修复的内容时拒绝 |
| `POST policy-sync/<source id>` | 立即同步该 Source 的允许列表：`policy`，即该 Source 已保存的部分 |
| `GET prompts`、`PUT prompts` 带 `{"config", "baseRevision"}` | 读取提示词配置：`current`（含其 `revision` 和 `config`）、`defaults`、`sections`（团队部分，按会话读取的顺序）、`skillName`（团队技能名称的模式）、`builtin`（团队技能不能使用的名称），以及 `skillPrefix`（会话加载技能名称时使用的前缀）。或保存它：新的 `revision` |
| `POST tickets/<id>/retry`、`POST tickets/<id>/stop` | 重试或停止一个任务，与面板行为一致 |

健康条目按职责分组：

| 条目 | 报告内容 |
| --- | --- |
| `runtime` | 应用本身 |
| `models` | 等待模型额度重试的会话 |
| `evals` | 最近一小时内不可用、且之后没有判定或忽略的评估 |
| `assessment`、`launch`、`delivery`、`relay`、`notice`、`reply` | [003 执行](003-execution.zh.md) 中描述的已存储工作；delivery 统计等待中的工作，而 reply 涵盖 Channel 消息 |
| `worker` | 执行器会话的事件处理；首次失败后出现 |
| `github`、`feishu`、`history` | Source 轮询、事件与历史恢复 |
| `sync:<source id>` | 允许列表同步 |

拒绝会带一个状态码和 `error`，其文本为英文：

- 400：值无效（`issues`，各含 `path`）、账号检查失败（`setup`）、固定拒绝（`code` 和 `values`），或请求体不是 JSON 或过大。
- 404：某物不存在。
- 409：revision 过期。
- 500：其他任何情况。

各 block：

- `source:github`、`source:feishu`：`{"enabled": true, "config": {…}}`。GitHub 的 config 含 `repository` 和 `cli`，以及开关 `observeIssues`、`observePulls`、`observeComments` 和 `observeCi`（默认关闭），它们接收仓库中每个新 issue、新 pull request 和评论，以及默认分支的 CI；Feishu 的 config 含 `cli`、`chats`（形如 `[{"chatId": "oc_…", "name": "…", "listen": "mentions"}]`，或 `"all"`）、`directMessages`，以及 `otherChats`（`"none"` 或 `"mentions"`）。
- `policy`：`{"rules": […], "sources": {"github": {"allowed": [{"id": "<login>"}], "bots": [{"id": "dependabot[bot]"}]}, "feishu": {"allowed": [{"id": "ou_…", "name": "…"}], "syncChat": "oc_…", "admission": {"oc_…": {"unlistedAddressed": "explicit"}}}}}`。`bots` 列出其消息可以成为推断候选的机器人。`admission` 行以聊天 id、Feishu 的 `other` 或 `direct`、GitHub 的 `issues`、`pulls`、`comments` 或 `ci` 为键；未设置的单元格取默认值（见 [002 授权](002-authorization.zh.md)）。
- `eval`：`mode`、`timeoutSeconds` 和 `model`。
- `executor`：`model`、`maxWorkers`、`directory`、`prepare` 和 `blockedCommands`。处理暂停是另一个独立设置 `paused`，由 `POST executor/pause` 设置。

更改仓库或 CLI 会先运行相应的安装检查。检查失败会返回 400，详情在 `setup` 中。账号更改成功，或在安装配置待处理期间的任何保存，都会返回 `restarting: true`。应用重启期间 API 暂时不可用。

```sh
api=http://127.0.0.1:3082/orchestrator/api
rev=$(curl -s -H 'x-orchestrator-request: 1' $api/settings | jq '.sources[] | select(.id == "github") | .revision')
curl -s -X PUT -H 'x-orchestrator-request: 1' -H 'content-type: application/json' $api/settings/source:github \
  -d "{\"value\": {\"enabled\": true, \"config\": {\"repository\": \"acme/widgets\", \"cli\": \"$HOME/.local/bin/gh-agent\"}}, \"revision\": $rev}"
```

## 安装检查

安装配置使用 DeepSeek Harness 的子进程服务，与 worker shell 相同。它会移除名称中包含 KEY、PASSWORD、SECRET 或 TOKEN 的环境变量。

安装配置校验 GitHub 仓库和智能体的推送权限，写入 worker 环境，并检查 git 对 github.com 只使用智能体凭据。Feishu 的安装失败只会禁用 Feishu Source。

安装配置写入的进程环境：

- **命令 shim** 位于 `<stateDir>/worker-bin`，在 `PATH` 中排在最前：`gh` 运行智能体的 CLI；`lark-cli` 运行机器人的 CLI；被阻止的命令会失败。shim 在运行其目标之前会从 `PATH` 中移除自己所在的目录。
- **git 配置** 位于 `<stateDir>/worker-gitconfig`：替换操作者的全局和系统 git 配置。它把智能体 CLI 选为 github.com 的凭据助手，把 GitHub SSH 地址改写为 HTTPS，并定义 Git LFS 过滤器。诸如 HTTP 代理的个人 git 设置不生效。这里不设置提交身份，git 从不提示输入凭据，且 `GH_TOKEN` 和 `GITHUB_TOKEN` 会被移除。

`worker-bin` 或 `worker-gitconfig` 中若有非 dsh-superagent 写入的文件，安装配置会中止。任务目录若位于某个自身配置添加了凭据的 git 仓库内，该任务会失败。

## 试用

用以允许的 GitHub 账号开一个 issue，或发表一条包含 `@<agent login> <request>` 的评论。在一个轮询间隔内（默认一分钟），Overview 应显示一个任务。智能体会确认回复该请求，在自己的会话和目录中工作，并在原对话中交付。使用 Feishu 时，在已配置的聊天中提及机器人。

## 升级

1. 等待所有执行器都不在回合进行中。
2. 备份 `<stateDir>/orchestrator.sqlite`。
3. 运行 `git pull && pnpm install && pnpm build`。
4. 运行 `scripts/dsh-superagent restart` 并检查其状态。

重启会结束正在运行的 Assignment，并以恢复说明启动替代者。团队文本和被覆盖的提示词部分会保留；没有覆盖的部分会跟随新的默认值。升级后请检查标记为 **Default updated** 的部分。

由较新版本迁移过的数据库无法被较旧版本打开。因此回滚需要升级前的备份。升级 DeepSeek Harness 本身之后，请重启正在运行的实例，以便面板加载匹配的产物。

### 智能体预设

worker 和 router 预设会在 5 秒后把 shell 命令移到后台。会话若没有其预设就无法加载。在会话仍在使用期间，请保留 `cordis.patch.yml` 中的 `dsh-superagent-worker` 和 `dsh-superagent-router` 行；否则恢复会以 `agent-preset/not-found` 失败。

## 故障排查

安装问题会以面板语言显示在概览中，并附指向修复位置的链接；日志和 API 显示下面这些英文文本。

| 症状 | 原因与修复 |
| --- | --- |
| `The agent GitHub CLI is not set.` | 在 GitHub 卡片上设置智能体的 CLI |
| `The agent GitHub CLI was not found.` | 设置包装器的绝对路径，或 `PATH` 上的命令名 |
| `The agent GitHub CLI cannot read its account` | 用 `auth login` 登录该包装器 |
| `@… cannot read …` 或 `@… cannot push to …` | 授予智能体账号该仓库的写权限 |
| `The GitHub Source names no repository.` | 在 GitHub 卡片上设置仓库 `owner/name` |
| 任务失败并报 `The prepare command failed: …` | 输出指明了原因，例如克隆路径错误；修复该命令，然后重试该任务 |
| `git does not read the github.com credential configuration dsh-superagent writes` | 安装 git 2.32 或更高版本 |
| 任务失败并报 `The git configuration of the repository in … sets …` | 从克隆的 `.git/config` 中移除所指的凭据或 `http.*.extraheader` 设置 |
| `… was not written by dsh-superagent` | 把所指文件移出 `<stateDir>/worker-bin` 或 `<stateDir>/worker-gitconfig`，或另选 `stateDir` |
| `The bot lark-cli allows user identities` | 让 Feishu Source 指向仅机器人身份的配置，如上面的 Feishu 机器人一节 |
| `The bot lark-cli does not work.` 或 `The bot identity of app … is …` | 检查配置的 app id 和密钥 |
| `The Feishu bot is not a member of the chat.` | 在该聊天的设置中把机器人加入聊天；下次尝试即会成功 |
| `status` 以 2 退出 | 某个部分报告错误，重启无法修复：`errors` 会列出每个部分（如管理 API 中所列）及其详情；每个部分恢复正常后会自行清除其条目 |
| `status` 以 3 退出 | 安装配置在等待：`setup` 说明缺少什么，概览会链接到修复它的设置 |
| `status` 以 1 退出 | 服务未运行、运行了两份、无响应，或其运行时报告错误；输出和最新日志会说明是哪种 |
| `… timed out after 90 s`、`… was stopped by …`、`… exited with code …` 或 `… could not run: …` | 某 CLI 失败但没有打印原因；以操作者用户身份手动运行所指程序，查看其自身的消息 |
| 面板提示 dsh-superagent 无响应 | 它正在重启，或因配置而未能启动；DeepSeek Harness 日志会说明原因 |
| `dsh-superagent configuration has keys it does not use`（日志） | 移除所指的键；消息会说明每个值现在归属何处 |
| 日志提示该插件与正在运行的 dsh 不兼容 | 安装处于 `engines.dsh` 范围内的 DeepSeek Harness 版本 |
| DeepSeek Harness 升级后面板显示 "Failed to load plugins" | 重启正在运行的实例 |
| 提及后没有任何反应 | 检查作者是否在该 Source 的允许列表上、Source 是否已启用、处理是否未暂停。在 GitHub 上，通过编辑 issue 正文添加的提及不会被接收；请在评论中提及智能体 |
