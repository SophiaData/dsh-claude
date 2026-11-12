import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SubprocessHandle, SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import { RepositorySetupService } from '../src/repository-setup.ts'

interface Reply {
  stdout?: string
  exitCode?: number
  lossy?: boolean
}

const temp: string[] = []
afterEach(async () => {
  await Promise.all(temp.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

function runtime(replies: Reply[]) {
  const spawn = vi.fn((spec: SubprocessSpawnSpec): SubprocessHandle => {
    if (typeof spec.cwd === 'string' && !existsSync(spec.cwd)) throw new Error(`Git command cwd missing: ${spec.cwd}`)
    const next = replies.shift()
    if (next === undefined) throw new Error(`Unexpected Git command: ${spec.argv.join(' ')}`)
    const stdout = next.stdout ?? ''
    return {
      pid: 1,
      stdin: undefined,
      stdout: undefined,
      stderr: undefined,
      collected: {
        stdout: { readFrom: () => ({ text: stdout, nextOffset: stdout.length, lossy: next.lossy === true }) },
        stderr: { readFrom: () => ({ text: '', nextOffset: 0, lossy: false }) },
      },
      done: Promise.resolve({ exitCode: next.exitCode ?? 0, signal: null }),
      terminate: vi.fn(),
      waitForExit: async () => true,
    }
  })
  return { spawn, resolveExecutable: vi.fn(async () => '/bin/git') }
}

async function setupLease(options: { sessionId?: string; checkoutExists?: boolean } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-claude-orphan-'))
  temp.push(root)
  const worktreeRoot = join(root, 'worktrees')
  const path = join(worktreeRoot, 'orphan')
  const leasePath = join(root, 'state', 'leases.json')
  const branch = 'feature/preserve-work'
  await mkdir(join(root, 'state'), { recursive: true })
  await mkdir(worktreeRoot, { recursive: true })
  if (options.checkoutExists !== false) await mkdir(path, { recursive: true })
  await writeFile(leasePath, JSON.stringify({
    schemaVersion: 1,
    leases: [{
      id: 'lease-1',
      root,
      path,
      branch,
      createdAt: '2020-01-01T00:00:00.000Z',
      pluginGeneratedBranch: true,
      ...(options.sessionId === undefined ? {} : { sessionId: options.sessionId }),
    }],
  }))
  const leases = async (): Promise<unknown[]> =>
    (JSON.parse(await readFile(leasePath, 'utf8')) as { leases: unknown[] }).leases
  return { root, path, branch, leasePath, worktreeRoot, leases }
}

const cleanStatus = '# branch.oid abcdef\n# branch.head feature/preserve-work\n'

describe('background orphan safety', () => {
  it('does not erase clean unpushed commits or archive the worktree session', async () => {
    const lease = await setupLease({ sessionId: 'session-1' })
    const fake = runtime([{ stdout: cleanStatus }, { stdout: '3\n' }])
    const archive = vi.fn(async () => undefined)
    await new RepositorySetupService(fake, { leasePath: lease.leasePath, worktreeRoot: lease.worktreeRoot, cleanupGraceMs: 0 })
      .cleanupOrphans([], archive)
    expect(await lease.leases()).toHaveLength(1)
    expect(existsSync(lease.path)).toBe(true)
    expect(archive).not.toHaveBeenCalled()
    expect(fake.spawn.mock.calls.map(call => call[0].argv)).toEqual([
      ['/bin/git', 'status', '--porcelain=v2', '--branch', '--untracked-files=all'],
      ['/bin/git', 'rev-list', '--count', lease.branch, '--not', '--remotes'],
    ])
  })

  it.each([
    ['dirty tracked files', `${cleanStatus}1 M. N... 100644 100644 100644 aaa bbb src/main.ts\n`, 0],
    ['untracked files', `${cleanStatus}? new-file.ts\n`, 0],
    ['unexpected checkout branch', '# branch.head feature/different\n', 0],
    ['Git status failure', cleanStatus, 1],
  ])('refuses %s', async (_reason, stdout, exitCode) => {
    const lease = await setupLease()
    const fake = runtime([{ stdout, exitCode }])
    await new RepositorySetupService(fake, { leasePath: lease.leasePath, worktreeRoot: lease.worktreeRoot, cleanupGraceMs: 0 })
      .cleanupOrphans([])
    expect(await lease.leases()).toHaveLength(1)
    expect(existsSync(lease.path)).toBe(true)
    expect(fake.spawn).toHaveBeenCalledTimes(1)
  })

  it('fails closed when remote commit count is unknown or malformed', async () => {
    const lease = await setupLease()
    const fake = runtime([{ stdout: cleanStatus }, { stdout: 'not-a-count\n' }])
    await new RepositorySetupService(fake, { leasePath: lease.leasePath, worktreeRoot: lease.worktreeRoot, cleanupGraceMs: 0 })
      .cleanupOrphans([])
    expect(await lease.leases()).toHaveLength(1)
    expect(fake.spawn).toHaveBeenCalledTimes(2)
  })

  it('does not delete a session-bound lease without an archiver', async () => {
    const lease = await setupLease({ sessionId: 'session-1' })
    const fake = runtime([{ stdout: cleanStatus }, { stdout: '0\n' }])
    await new RepositorySetupService(fake, { leasePath: lease.leasePath, worktreeRoot: lease.worktreeRoot, cleanupGraceMs: 0 })
      .cleanupOrphans([])
    expect(await lease.leases()).toHaveLength(1)
    expect(fake.spawn).toHaveBeenCalledTimes(2)
  })

  it('keeps a clean worktree when session archival throws', async () => {
    const lease = await setupLease({ sessionId: 'session-1' })
    const fake = runtime([{ stdout: cleanStatus }, { stdout: '0\n' }])
    const archive = vi.fn(async () => { throw new Error('session persistence failed') })
    await new RepositorySetupService(fake, { leasePath: lease.leasePath, worktreeRoot: lease.worktreeRoot, cleanupGraceMs: 0 })
      .cleanupOrphans([], archive)
    expect(archive).toHaveBeenCalledWith(lease.path)
    expect(await lease.leases()).toHaveLength(1)
    expect(existsSync(lease.path)).toBe(true)
    expect(fake.spawn).toHaveBeenCalledTimes(2)
  })

  it('retains the lease if Git refuses a non-forced remove', async () => {
    const lease = await setupLease()
    const fake = runtime([{ stdout: cleanStatus }, { stdout: '0\n' }, { exitCode: 1 }])
    await new RepositorySetupService(fake, { leasePath: lease.leasePath, worktreeRoot: lease.worktreeRoot, cleanupGraceMs: 0 })
      .cleanupOrphans([])
    expect(await lease.leases()).toHaveLength(1)
    expect(existsSync(lease.path)).toBe(true)
    expect(fake.spawn.mock.calls[2]?.[0].argv).toEqual(['/bin/git', 'worktree', 'remove', '--', lease.path])
  })

  it('does not delete a missing checkout branch that has unpushed commits', async () => {
    const lease = await setupLease({ checkoutExists: false })
    const fake = runtime([{ stdout: '2\n' }])
    await new RepositorySetupService(fake, { leasePath: lease.leasePath, worktreeRoot: lease.worktreeRoot, cleanupGraceMs: 0 })
      .cleanupOrphans([])
    expect(await lease.leases()).toHaveLength(1)
    expect(fake.spawn.mock.calls.map(call => call[0].argv)).toEqual([
      ['/bin/git', 'rev-list', '--count', lease.branch, '--not', '--remotes'],
    ])
  })

  it('preserves unleased directories containing unknown user files, even without .git', async () => {
    const lease = await setupLease()
    const unclaimed = join(lease.worktreeRoot, 'lost-lease')
    await mkdir(unclaimed, { recursive: true })
    await writeFile(join(unclaimed, 'notes.md'), 'uncommitted work\n')
    const fake = runtime([{ stdout: cleanStatus }, { stdout: '3\n' }])
    await new RepositorySetupService(fake, { leasePath: lease.leasePath, worktreeRoot: lease.worktreeRoot, cleanupGraceMs: 0 })
      .cleanupOrphans([])
    expect(existsSync(join(unclaimed, 'notes.md'))).toBe(true)
    expect(await lease.leases()).toHaveLength(1)
  })
})
