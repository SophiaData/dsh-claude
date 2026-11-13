import { describe, expect, it } from 'vitest'
import { REQUIRED_PACKED_FILES, verifyDistribution } from '../scripts/distribution-contract.mjs'

const manifest = {
  name: '@sophiadata-ai/dsh-claude',
  version: '0.2.4',
  main: 'lib/index.mjs',
  types: 'lib/index.d.mts',
  bin: { 'dsh-claude': 'lib/bin.mjs' },
  exports: {
    '.': { types: './lib/index.d.mts', default: './lib/index.mjs' },
    './preset-route': { types: './lib/preset-route.d.mts', default: './lib/preset-route.mjs' },
    './client': './lib/client.js',
    './package.json': './package.json',
  },
  files: ['lib', 'legacy-preset', 'cordis.patch.yml', 'README.md', 'INSTALL.md', 'CHANGELOG.md', 'LICENSE'],
  dsh: { bundle: { patch: './cordis.patch.yml' } },
}
const packed = [
  ...REQUIRED_PACKED_FILES,
  'lib/index.mjs',
  'lib/index.d.mts',
  'lib/bin.mjs',
  'lib/preset-route.mjs',
  'lib/preset-route.d.mts',
  'lib/client.js',
]

describe('offline distribution contract', () => {
  it('accepts a tarball with the declared exports, DSH patch and legacy preset assets', () => {
    expect(verifyDistribution(manifest, packed)).toMatchObject({
      name: '@sophiadata-ai/dsh-claude',
      version: '0.2.4',
      count: packed.length,
    })
  })

  it.each([
    ['runtime entry', 'lib/index.mjs'],
    ['compiled type declarations', 'lib/index.d.mts'],
    ['command executable', 'lib/bin.mjs'],
    ['preset route', 'lib/preset-route.mjs'],
    ['client bundle', 'lib/client.js'],
    ['DSH bundle patch', 'cordis.patch.yml'],
    ['legacy preset', 'legacy-preset/agent.cordis.yml'],
  ])('rejects a missing %s in npm pack', (_label, missing) => {
    expect(() => verifyDistribution(manifest, packed.filter(path => path !== missing)))
      .toThrow(`Missing required file from npm tarball: ${missing}`)
  })

  it.each([
    'src/private.ts',
    'test/private.test.ts',
    'scripts/publish.mjs',
    '.npmrc',
    '.env.production',
    'node_modules/secret/index.js',
    '.github/workflows/ci.yml',
    'lib/../secret',
    'lib/payload.tgz',
  ])('fails a distribution that includes private/source material (%s)', forbidden => {
    expect(() => verifyDistribution(manifest, [...packed, forbidden])).toThrow()
  })

  it('rejects a path traversal or source export even if a file happens to be included', () => {
    expect(() => verifyDistribution({
      ...manifest, exports: { ...manifest.exports, './unsafe': '../src/index.ts' },
    }, packed)).toThrow(/relative package path|unsafe/u)
    expect(() => verifyDistribution({
      ...manifest, exports: { ...manifest.exports, './unsafe': './src/index.ts' },
    }, packed)).toThrow(/compiled lib/u)
  })

  it('refuses an unrelated npm package and invalid version', () => {
    expect(() => verifyDistribution({ ...manifest, name: '@norman-else/dsh-claude' }, packed))
      .toThrow('Unexpected distribution package name')
    expect(() => verifyDistribution({ ...manifest, version: 'latest' }, packed))
      .toThrow('Invalid distribution version')
  })

  it('rejects duplicate tarball entries and a missing DSH patch declaration', () => {
    expect(() => verifyDistribution(manifest, [...packed, 'lib/index.mjs'])).toThrow(/Duplicate/u)
    expect(() => verifyDistribution({
      ...manifest, dsh: { bundle: { patch: './other.patch.yml' } },
    }, packed)).toThrow(/bundle patch/u)
  })
})
