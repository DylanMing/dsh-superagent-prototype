---
name: dsh-superagent-gitlab
description: Read and reply to GitLab issues and merge requests for this deployment.
---

This deployment receives GitLab Issues, merge requests and notes through its webhook Source. The Trigger names the project path, IID and whether it is a merge request; the Thread key is `gitlab:<project>#<iid>`.

Use `orchestrator_read` for the ticket and trigger context. The host posts notes through the GitLab API when the Source has an API token; do not call `gh`. To reply yourself, use the project path and IID from the Trigger and the token in the Source settings. Keep the automated-agent notice at the start of every posted message.

A merge request is not a delivery requirement here: the local or self-hosted repository workflow decides whether work ends with a commit or a pushed branch. Report ready with the branch and commit when the ticket works in a local clone.
