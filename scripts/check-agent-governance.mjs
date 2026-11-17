#!/usr/bin/env node
// Checks the repository-owned Agent instructions without installing dependencies.
// This is not a runtime, coverage, security or Desktop compatibility check.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const skills = [
  '.agents/skills/dsh-claude-plan/SKILL.md',
  '.agents/skills/dsh-claude-implement/SKILL.md',
  '.agents/skills/dsh-claude-review/SKILL.md',
  '.agents/skills/dsh-claude-pre-pr/SKILL.md',
];
const documents = [
  'AGENTS.md',
  'CLAUDE.md',
  'docs/development.md',
  'docs/testing.md',
  '.github/pull_request_template.md',
  ...skills,
];
const errors = [];

function fileText(path) {
  const full = resolve(root, path);
  if (!existsSync(full)) {
    errors.push('Missing required file: ' + path);
    return null;
  }
  return readFileSync(full, 'utf8');
}

for (const path of documents) {
  const body = fileText(path);
  if (body === null) continue;
  if (skills.includes(path) && !/^---\r?\nname: [a-z][a-z0-9-]*\r?\ndescription: [^\r\n]+\r?\n---\r?\n/.test(body)) {
    errors.push('Invalid skill frontmatter: ' + path);
  }
  const markdownLink = /!?\[[^\]]*\]\(([^)]+)\)/g;
  for (const match of body.matchAll(markdownLink)) {
    const href = match[1].trim().split(/\s+["']/)[0];
    if (!href || href.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(href)) continue;
    const local = href.split('#')[0].split('?')[0];
    if (!local) continue;
    let decoded;
    try { decoded = decodeURIComponent(local); }
    catch { errors.push('Bad link encoding in ' + path + ': ' + href); continue; }
    if (isAbsolute(decoded)) {
      errors.push('Absolute local link in ' + path + ': ' + href);
      continue;
    }
    const target = resolve(root, dirname(path), decoded);
    const within = relative(root, target);
    if (within === '..' || within.startsWith('..' + sep) || !existsSync(target)) {
      errors.push('Broken local link in ' + path + ': ' + href);
    }
  }
}

const template = fileText('.github/pull_request_template.md');
if (template !== null) {
  for (const heading of ['## Motivation', '## Changes', '## Testing', '## AI Usage']) {
    if (!template.includes(heading)) errors.push('PR template missing ' + heading);
  }
}
const rules = fileText('AGENTS.md');
if (rules !== null && !rules.includes('scripts/check-agent-governance.mjs')) {
  errors.push('AGENTS.md must document the governance check');
}

if (errors.length) {
  for (const message of errors) process.stderr.write('ERROR: ' + message + '\n');
  process.exitCode = 1;
} else {
  process.stdout.write('Agent governance: ' + documents.length + ' files and local links OK\n');
}
