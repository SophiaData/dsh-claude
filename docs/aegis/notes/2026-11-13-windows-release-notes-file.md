# Agent Note: Windows-safe GitHub release notes

Status: implemented — `pnpm release` writes commit notes to a temp file.

## Problem

`scripts/publish.mjs` passed a multi-line body to `gh release create --notes`.
On Windows that argv is unsafe: cmd.exe quoting rejects embedded newlines, so
the npm publish step can succeed while GitHub Release creation fails.

## Decision

Extract `releaseCommitNotes` / `releaseCreateArguments` into
`scripts/github-release.mjs`. When there are commit subjects, write them to a
temporary `notes.md` and pass `--notes-file`. Empty subject lists still omit
the notes flags and rely on `--generate-notes` alone.

## Alternatives considered

- Keep inline `--notes` and special-case Windows escaping: fragile across
  shells and still hits the newline rejection in `windowsCommandLine` for npm
  shims; `gh` itself is spawned without that shim, but multi-line argv remains
  brittle under PowerShell wrappers.
- Drop the commit-list prepend and rely only on `--generate-notes`: loses the
  direct-commit subjects that GitHub's generated notes omit.

## Acceptance criteria

- `releaseCreateArguments` never emits `--notes`.
- Unit tests cover notes-file and no-subjects shapes.
- Real publish path deletes the temp directory in `finally`.
