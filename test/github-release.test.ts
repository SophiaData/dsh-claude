import { describe, expect, it } from 'vitest'
import { releaseCommitNotes, releaseCreateArguments } from '../scripts/github-release.mjs'

describe('releaseCommitNotes', () => {
  it('formats the commit list the publish script prepends', () => {
    expect(releaseCommitNotes('- fix: example (abc1234)')).toBe(
      '## Commits\n\n- fix: example (abc1234)\n',
    )
  })

  it('rejects an empty subject list', () => {
    expect(() => releaseCommitNotes('')).toThrow(/at least one subject/u)
  })
})

describe('releaseCreateArguments', () => {
  it('uses --notes-file when commit notes are present', () => {
    expect(releaseCreateArguments({
      tag: 'v0.2.4',
      head: 'd0c133c',
      notesPath: 'C:\\temp\\notes.md',
    })).toEqual([
      'release', 'create', 'v0.2.4',
      '--target', 'd0c133c',
      '--title', 'v0.2.4',
      '--generate-notes',
      '--notes-file', 'C:\\temp\\notes.md',
    ])
  })

  it('omits notes flags when there are no commit subjects', () => {
    expect(releaseCreateArguments({ tag: 'v0.2.4', head: 'd0c133c' })).toEqual([
      'release', 'create', 'v0.2.4',
      '--target', 'd0c133c',
      '--title', 'v0.2.4',
      '--generate-notes',
    ])
  })

  it('never asks for inline --notes', () => {
    const args = releaseCreateArguments({
      tag: 'v0.2.4',
      head: 'd0c133c',
      notesPath: '/tmp/notes.md',
    })
    expect(args).not.toContain('--notes')
  })
})
