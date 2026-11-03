/** The code side of an installation: a GitHub repository with pull requests, or a local git repository. */
import { dirname } from 'node:path'
import type { SubprocessRuntime } from '@deepseek-ai/dsh-subprocess'
import type { LocalRepository } from '../deployment.ts'
import { runAsWorker } from '../infra/environment.ts'

/** What preparing a ticket's directory needs; a GitHub installation leaves it to the configured prepare command. */
export interface PrepareInput {
  directory: string
  subprocess: SubprocessRuntime
  signal: AbortSignal
  env: Record<string, string>
}

/** One installation's repository and the delivery rules its workers follow. */
export interface CodeHost {
  kind: 'github' | 'local'
  /** `owner/name` on GitHub, or the absolute path of the local repository. */
  repository: string
  /** The ref a local worktree starts from; empty for the repository's HEAD. */
  branch: string
  /** The local clone's origin, when it has one, and the host it names. */
  remote?: { url: string; provider: 'gitea' | 'gitlab' | 'other' }
  /** Whether workers can open pull requests, follow CI and receive reviews. */
  pullRequests: boolean
  /** Text that replaces pull-request delivery instructions in local mode. */
  instructions?: { heading: string; text: string }
  /** Creates a ticket directory; a no-op on GitHub because the prepare command owns it. */
  prepare(input: PrepareInput): Promise<void>
}

/** A local git repository: workers commit in a worktree, and a person reviews in the panel. */
export function localCodeHost(repository: string, branch = '', remote?: LocalRepository['remote']): CodeHost {
  const host = remote ? ` Its origin is ${remote.url} (${remote.provider === 'other' ? 'a self-hosted git host' : remote.provider}).` : ''
  return {
    kind: 'local', repository, branch, pullRequests: false, ...remote ? { remote } : {},
    instructions: { heading: 'Local git repository',
      text: `This installation works in the local git repository at ${repository}.${host} Do not call gh, open a pull request, wait for CI or request a review. `
        + 'Implement and test the change in the ticket directory, then commit it on a branch. If this repository has a remote you can push to '
        + '(GitLab, Gitea or another git host), push the branch with git and report its name; otherwise leave the commit local. '
        + 'Report ready with the branch name and commit hash; the management panel shows the change for a person to review. '
        + 'These instructions replace every pull-request delivery instruction in this prompt.' },
    async prepare({ directory, subprocess, signal, env }) {
      await runAsWorker(subprocess, ['git', '-C', repository, 'worktree', 'add', '--detach', directory, branch || 'HEAD'],
        dirname(directory), signal, env)
    },
  }
}
/** A GitHub repository: the existing pull-request delivery path, with the configured prepare command. */
export function githubCodeHost(repository: string): CodeHost {
  return { kind: 'github', repository, branch: '', pullRequests: true, async prepare() { /* The prepare command creates the directory. */ } }
}
/** Selects the code host a resolved deployment describes. */
export function codeHostOf(deployment: { repository: string; local?: LocalRepository }): CodeHost {
  return deployment.local ? localCodeHost(deployment.local.path, deployment.local.branch, deployment.local.remote) : githubCodeHost(deployment.repository)
}
