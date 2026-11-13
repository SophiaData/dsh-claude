/** Arguments and note bodies for `gh release create`, kept apart from the
 *  publish steps so the Windows-safe notes-file path can be unit-tested. */

/** Markdown prepended ahead of GitHub's generated notes. */
export function releaseCommitNotes(subjects) {
  if (typeof subjects !== 'string' || subjects.length === 0) {
    throw new Error('Release commit notes need at least one subject line')
  }
  return `## Commits\n\n${subjects}\n`
}

/** argv for `gh` after the program name. Pass `notesPath` when there are
 *  commit subjects so the body is read from a file instead of an inline
 *  `--notes` value: cmd.exe / Windows argument quoting rejects embedded
 *  newlines, and that is how this repository creates releases from Windows. */
export function releaseCreateArguments({ tag, head, notesPath }) {
  if (typeof tag !== 'string' || tag.length === 0) throw new Error('Release tag is required')
  if (typeof head !== 'string' || head.length === 0) throw new Error('Release target commit is required')
  const args = [
    'release', 'create', tag,
    '--target', head,
    '--title', tag,
    '--generate-notes',
  ]
  if (notesPath === undefined) return args
  if (typeof notesPath !== 'string' || notesPath.length === 0) {
    throw new Error('Release notes path must be a non-empty string when provided')
  }
  return [...args, '--notes-file', notesPath]
}
