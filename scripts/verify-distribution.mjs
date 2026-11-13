#!/usr/bin/env node
/** Offline, read-only release preflight. npm pack --dry-run --ignore-scripts
 * reports the real tarball contents without creating or publishing a tarball.
 * This command never authenticates to npm/GitHub, tags, pushes or restarts DSH. */
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { verifyDistribution } from './distribution-contract.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))

const args = ['pack', '--dry-run', '--json', '--ignore-scripts', '--offline']
const windows = process.platform === 'win32'
const result = spawnSync(
  windows ? (process.env.ComSpec ?? 'cmd.exe') : 'npm',
  windows ? ['/d', '/s', '/c', 'npm pack --dry-run --json --ignore-scripts --offline'] : args,
  {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 120_000,
    maxBuffer: 8 * 1024 * 1024,
  },
)
if (result.error) throw result.error
if (result.status !== 0) {
  throw new Error(`npm pack dry run failed (exit ${result.status ?? 'unknown'}): ${(result.stderr ?? '').slice(0,1_000)}`)
}
let packs
try {
  packs = JSON.parse(result.stdout)
} catch {
  throw new Error('npm pack did not produce a JSON file list')
}
if (!Array.isArray(packs) || packs.length !== 1 || packs[0]?.name !== manifest.name
  || packs[0]?.version !== manifest.version || !Array.isArray(packs[0]?.files)) {
  throw new Error('npm pack metadata does not match package.json')
}
const report = verifyDistribution(manifest, packs[0].files.map(file => file.path))
console.log(`Verified offline distribution: ${report.name}@${report.version} (${report.count} packed files, ${report.required.length} required entries)`)
