---
name: dsh-superagent-gitea
description: Read and reply to Gitea issues and pull requests for this deployment.
---

This deployment receives Gitea Issues, pull requests and comments through its webhook Source. The Trigger names the repository, number and whether it is a pull request; the Thread key is `gitea:<repository>#<number>`.

Use `orchestrator_read` for the ticket and trigger context. The host posts replies through the Gitea API when the Source has an API token; do not call `gh`. To reply yourself, use the repository and number from the Trigger and the token in the Source settings. Keep the automated-agent notice at the start of every posted message.

A pull request is not a delivery requirement here: the local or self-hosted repository workflow decides whether work ends with a commit or a pushed branch. Report ready with the branch and commit when the ticket works in a local clone.
