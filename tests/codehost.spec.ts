import { execFile, spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { SubprocessRuntime } from '@deepseek-ai/dsh-subprocess'
import { codeHostOf, githubCodeHost, localCodeHost } from '../src/codehost/index.ts'
import { gitEnv } from './fixtures/git.ts'

const exec = promisify(execFile)
let dir: string
const signal = new AbortController().signal
/** Minimal SubprocessRuntime backed by child_process.spawn with an isolated global git config. */
const subprocess: SubprocessRuntime = {
  spawn: ({ argv, cwd }: { argv: readonly string[]; cwd: string }) => {
    const child = spawn(argv[0]!, argv.slice(1), { cwd, env: gitEnv({ GIT_CONFIG_GLOBAL: join(dir, 'global'), GIT_CONFIG_NOSYSTEM: '1' }) })
    const output = { stdout: '', stderr: '' }
    child.stdout.on('data', chunk => { output.stdout += String(chunk) })
    child.stderr.on('data', chunk => { output.stderr += String(chunk) })
    const reader = (name: 'stdout' | 'stderr') => ({ readFrom: () => ({ text: output[name], nextOffset: 0, lossy: false }) })
    const done = new Promise(resolve => child.on('close', code => resolve({ exitCode: code, signal: null })))
    return { done, collected: { stdout: reader('stdout'), stderr: reader('stderr') } }
  },
} as unknown as SubprocessRuntime
const git = (...args: string[]) => exec('git', args, { cwd: dir, env: gitEnv({ GIT_CONFIG_GLOBAL: join(dir, 'global'), GIT_CONFIG_NOSYSTEM: '1' }) })

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'codehost-'))
  mkdirSync(join(dir, 'repo'))
  await git('init', '-q', join(dir, 'repo'))
  writeFileSync(join(dir, 'repo', 'README.md'), 'first\n')
  await git('-C', join(dir, 'repo'), 'add', 'README.md')
  await git('-C', join(dir, 'repo'), '-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '-qm', 'first')
})
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

describe('CodeHost', () => {
  it('selects GitHub by default and a local repository when the deployment names one', () => {
    expect(codeHostOf({ repository: 'acme/widgets' })).toMatchObject({ kind: 'github', repository: 'acme/widgets', pullRequests: true })
    expect(codeHostOf({ repository: '/srv/repo', local: { path: '/srv/repo', branch: 'main' } }))
      .toMatchObject({ kind: 'local', repository: '/srv/repo', branch: 'main', pullRequests: false })
    expect(githubCodeHost('acme/widgets').instructions).toBeUndefined()
    expect(localCodeHost('/srv/repo').instructions?.text).toContain('Do not call gh')
  })

  it('creates a detached worktree from the configured ref', async () => {
    const directory = join(dir, 'ticket')
    await localCodeHost(join(dir, 'repo')).prepare({ directory, subprocess, signal, env: {} })
    expect(readFileSync(join(directory, 'README.md'), 'utf8')).toBe('first\n')
    expect(readFileSync(join(directory, '.git'), 'utf8')).toContain('gitdir:')
  })

  it('reports a missing local repository rather than leaving an empty directory', async () => {
    const directory = join(dir, 'ticket')
    await expect(localCodeHost(join(dir, 'missing')).prepare({ directory, subprocess, signal, env: {} })).rejects.toThrow()
  })
})
