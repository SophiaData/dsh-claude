# Changelog

All notable changes to this fork are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the
project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

This repository is the SophiaData fork of
[Norman-else/dsh-claude](https://github.com/Norman-else/dsh-claude), published
as `@sophiadata-ai/dsh-claude` and built for the DSH `0.2.1-rc.5` package line.

## [Unreleased]

## [0.2.1] - 2026-11-03

First standard SemVer release. Supersedes the `0.2.0-sophiadata.N` prereleases
with the same content, so `^0.2.1`-style ranges and `latest` resolve normally.
Install with `dsh plugin add @sophiadata-ai/dsh-claude`.

## [0.2.0-sophiadata.1] - 2026-11-03

### Fixed

- A provider-prefixed model the CLI lineup actually lists is dispatched as
  chosen again. The foreign-model guard treated every `/`-carrying id as
  foreign and backed it off to the preset default, so on a gateway-backed CLI
  (Magpie: `auto/…`, `cursor/…`, `giikin/…`) picking any of those models
  silently ran the default model instead. Only an id the lineup does not cover
  *and* that carries a `/` is foreign now.

## [0.2.0-sophiadata.0] - 2026-11-02

First release of the fork, adapted to the DSH `0.2.1-rc.5` package line.

### Added

- The `@sophiadata-ai/dsh-claude` publish line: the bundle patch's declared
  preset, the preset route, the client ModuleLoader id, and update probing all
  name the new package.
- Windows Claude Code discovery. `claude.exe` is resolved beside PATH entries
  and in `~/.local/bin`, and that directory is appended to the tool PATH that a
  Start-Menu launch omits, so `dsh-claude doctor` and Claude sessions work with
  no `executablePath` configured.
- A guard that keeps a model from another DSH provider
  (`dsh-fe/deepseek-v4-flash`, `magpie/…`) out of the Claude CLI: the request
  header backs it off to `default`, turn dispatch guards a session that already
  persisted one, and the ask side query sends no `--model` for it. Model ids
  the lineup does not cover but that carry no provider prefix still pass
  through, since they may be CLI spellings from a newer release.

### Changed

- DSH peers and the development graph moved to the `0.2.1-rc.5` line;
  `@deepseek-ai/dsh-invariants` stays on `0.2.0-rc.2`, the only published
  version.
- Upgrade detection still recognizes managed preset content written under the
  legacy `@norman-else/dsh-claude` name.
- README, INSTALL, and the adaptation note describe the fork, the correct
  legacy package names for older Hosts, and the state that was actually
  verified.

### Fixed

- The host job kinds this plugin contributes (`subagent`, `claude`) are merged
  back into `JobKindMap`; Host 0.2.1 ships only `bash` as a built-in.
- Sessions no longer fail a turn with `[claude-code:unrecognized_model]` and an
  unknown side-effect outcome when they carry another provider's model id.
