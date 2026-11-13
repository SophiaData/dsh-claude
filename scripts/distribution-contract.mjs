/** Pure release-tarball assertions. GitHub URL installs use committed lib/,
 * while npm and release tarballs use the exact package.json files allowlist.
 * Keep checks independent from registry credentials, network and publication. */
export const REQUIRED_PACKED_FILES = [
  'package.json',
  'README.md',
  'INSTALL.md',
  'CHANGELOG.md',
  'LICENSE',
  'cordis.patch.yml',
  'legacy-preset/agent.cordis.yml',
  'legacy-preset/preset.yml',
]

const SAFE_PACKED_PATH = /^(?:[A-Za-z0-9@._-]+\/)*[A-Za-z0-9@._-]+$/u
const BLOCKED_PATH_PARTS = new Set(['node_modules', '.git', '.github', 'src', 'test', 'tests', 'scripts', '.npmrc', '.env'])

function artifactPath(value, label) {
  if (typeof value !== 'string' || !value.startsWith('./')) {
    throw new Error(`${label} must be a relative package path (./...)`)
  }
  const path = value.slice(2)
  if (!SAFE_PACKED_PATH.test(path) || path.split('/').some(part => part === '.' || part === '..')) {
    throw new Error(`${label} has an unsafe package path: ${value}`)
  }
  if (path !== 'package.json' && !path.startsWith('lib/')) {
    throw new Error(`${label} must point to a compiled lib/ artifact: ${value}`)
  }
  return path
}

function exportPaths(node, label, paths) {
  if (typeof node === 'string') {
    paths.add(artifactPath(node, label))
    return
  }
  if (typeof node !== 'object' || node === null || Array.isArray(node)) {
    throw new Error(`${label} has no package entrypoint`)
  }
  const entries = Object.entries(node)
  if (entries.length === 0) throw new Error(`${label} has no package entrypoint`)
  for (const [name, value] of entries) exportPaths(value, `${label}.${name}`, paths)
}

/** Verify the *actual file list* npm plans to place in the release tarball.
 * Throws instead of silently omitting a missing runtime export or private file.
 * Pure and fixture-testable; collecting the file list is the CLI's job. */
export function verifyDistribution(manifest, packedPaths) {
  if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('package.json must be an object')
  }
  if (manifest.name !== '@sophiadata-ai/dsh-claude') throw new Error('Unexpected distribution package name')
  if (typeof manifest.version !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(manifest.version)) {
    throw new Error('Invalid distribution version')
  }
  if (!Array.isArray(manifest.files) || !manifest.files.includes('lib') || !manifest.files.includes('cordis.patch.yml')) {
    throw new Error('Package files allowlist must ship lib/ and cordis.patch.yml')
  }
  if (!Array.isArray(packedPaths) || packedPaths.length === 0) throw new Error('npm pack returned no files')
  const packaged = new Set()
  for (const path of packedPaths) {
    if (typeof path !== 'string' || !SAFE_PACKED_PATH.test(path)) throw new Error(`Unsafe packed path: ${String(path)}`)
    const parts = path.split('/')
    if (parts.some(part => BLOCKED_PATH_PARTS.has(part) || part === '..')
      || parts.some(part => part === '.npmrc' || part.startsWith('.env.'))
      || path.endsWith('.tgz')) {
      throw new Error(`Unexpected private/source file in package: ${path}`)
    }
    if (packaged.has(path)) throw new Error(`Duplicate file in package: ${path}`)
    packaged.add(path)
  }
  const required = new Set(REQUIRED_PACKED_FILES)
  required.add(artifactPath(`./${manifest.main}`.replace('././', './'), 'main'))
  required.add(artifactPath(`./${manifest.types}`.replace('././', './'), 'types'))
  if (!manifest.bin || typeof manifest.bin !== 'object') throw new Error('Package bin is missing')
  for (const [name, path] of Object.entries(manifest.bin)) {
    required.add(artifactPath(path.startsWith('./') ? path : `./${path}`, `bin.${name}`))
  }
  if (!manifest.exports || typeof manifest.exports !== 'object') throw new Error('Package exports are missing')
  exportPaths(manifest.exports, 'exports', required)
  if (manifest.dsh?.bundle?.patch !== './cordis.patch.yml') {
    throw new Error('DSH plugin bundle patch is missing or inconsistent')
  }
  for (const path of required) {
    if (!packaged.has(path)) throw new Error(`Missing required file from npm tarball: ${path}`)
  }
  if (![...packaged].some(path => path.startsWith('lib/'))) throw new Error('No compiled lib/ output in package')
  return { name: manifest.name, version: manifest.version, count: packaged.size, required: [...required] }
}
