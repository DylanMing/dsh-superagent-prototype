# dsh-superagent

> [English](README.md) | 中文

> **仅供研究参考的原型，不是 DeepSeek 官方产品。** 这份代码源自我们团队的日常开发工作，其中大量工程由编码代理完成。请把它当作研究代码，而不是生产就绪的软件。它可能仍包含缺陷，其编码风格和工程实践也可能不一致。在你自己的环境中使用之前，请先审查并调整它。
>
> 我们为公开发布做了适配，因此它并不等同于我们的内部版本，也不等同于《Exploring Super-agent Design: Towards a More Autonomous Agent System》一文所描述的实现。文章中讨论的某些设计属于未来发展方向，并未在此原型中实现。

dsh-superagent 是一个面向 GitHub 仓库或本地 git 检出的主动式编码代理，以 bundle 形式打包，供 [DeepSeek Harness](https://www.deepseek.com/en/harness/) 使用。它可以从 GitHub、Feishu、自建 Gitea/GitLab webhook、通用 IM 桥接器或 DSH 侧边栏面板接收工作。当某个被允许的人向代理请求工作时，它会创建一条工作项，在自己的代理会话和目录中处理它，并在原对话或面板中回复；在本地检出上，它会留下分支和提交供人审查。一个 Web 面板展示哪些事项需要人来处理。

这也是一种与代理协作的方式：**占用尽可能少的人类注意力，提供尽可能多的价值。** 一个能为整个团队行动的代理，也可能浪费整个团队的注意力，因此它只在被请求时、或团队所写规则允许时才行动，并且只在必须有人行动或有人能用到结果时才发声。[docs/000-philosophy.zh.md](docs/000-philosophy.zh.md) 阐述了这一原则以及它对操作者提出的要求。

## 设置

**以前从未用过 DSH、Git 或终端？请先从[新手指南](docs/009-beginner-guide.zh.md)开始。** 它用平实的语言解释界面、第一条消息以及常见的失败情况。

安装设置有很多步骤，所以由代理和你一起完成。对你的编码代理说：

> 阅读本仓库中的 SETUP.zh.md，和我一起安装设置 dsh-superagent。

它会一次问一个简短的问题，一次性展示完整计划，然后安装并配置所有内容。它遵循的就是 [SETUP.zh.md](SETUP.zh.md)。

## 文档

按顺序阅读这些编号文档；每一篇都只建立在它之前的文档之上。每篇编号文档旁边都有对应的简体中文版（`*.zh.md`），可随时切换。

- [000 理念](docs/000-philosophy.zh.md)
- [001 领域模型](docs/001-domain.zh.md)
- [002 授权](docs/002-authorization.zh.md)
- [003 执行](docs/003-execution.zh.md)
- [004 提示词](docs/004-prompts.zh.md)
- [005 面板](docs/005-panel.zh.md)
- [006 部署](docs/006-deployment.zh.md)：手动安装设置、配置、升级与故障排查
- [007 架构](docs/007-architecture.zh.md)
- [008 实操手册](docs/008-cookbook.zh.md)：添加一个来源
- [009 新手指南](docs/009-beginner-guide.zh.md)：给从未用过 DSH、Git 或终端的人的入门步骤
- [010 开发指南](docs/010-development-guide.zh.md)：目标设计、开发历史、当前实现与剩余工作

## 开发

在改动 Source 或 CodeHost 架构之前，请先阅读 [docs/010-development-guide.zh.md](docs/010-development-guide.zh.md)。

`pnpm check` 会运行类型检查、测试和构建。

## 许可证

[MIT](LICENSE)
