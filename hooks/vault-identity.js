#!/usr/bin/env node
/**
 * SessionStart hook — inject registry-backed vault identity and project context:
 * owner identity (Context/me.md), project README excerpt, today's daily section,
 * and the latest local session handoff.
 */

const fs = require('fs');
const path = require('path');
const { REGISTRY_PATH, isInside, normalizePath, readRegistry, resolveProject, todayIso } = require('./_common');

function stripFrontmatter(markdown) {
  return markdown.replace(/^---[\s\S]*?---\n/, '').trim();
}

function sectionFromMarkdown(markdown, heading) {
  const lines = markdown.split(/\r?\n/);
  const header = `## ${heading}`;
  const start = lines.findIndex((line) => line.trim() === header);
  if (start === -1) return '';

  const sectionLines = [];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith('## ')) break;
    sectionLines.push(line);
  }
  return sectionLines.join('\n').trim();
}

function latestSessionFrom(startDir, documentsRoot, projectSource) {
  if (!projectSource) return '';

  const candidates = [];
  let current = normalizePath(startDir);
  const boundary = normalizePath(projectSource || documentsRoot);

  while (isInside(current, boundary)) {
    candidates.push(path.join(current, '.claude', 'sessions'));
    if (current === boundary) break;
    current = path.dirname(current);
  }

  for (const sessionsDir of [...new Set(candidates)]) {
    if (!fs.existsSync(sessionsDir)) continue;
    const files = fs.readdirSync(sessionsDir)
      .filter((file) => file.endsWith('.md'))
      .sort()
      .reverse();
    if (files.length === 0) continue;
    return fs.readFileSync(path.join(sessionsDir, files[0]), 'utf8').trim().slice(0, 500);
  }
  return '';
}

const registry = readRegistry();
if (!registry) process.exit(0);

const cwd = process.cwd();
if (!isInside(cwd, registry.documents_root)) process.exit(0);

const mePath = path.join(registry.vault_root, 'Context', 'me.md');
if (!fs.existsSync(mePath)) process.exit(0);

const project = resolveProject(registry, cwd);
const projectLabel = project ? project.label : 'General';
const section = project ? project.daily_section : 'General';
const contextLimit = (project && project.context_limit) || 500;
const dailyPath = path.join(registry.vault_root, 'Daily', `${todayIso()}.md`);

const meBody = stripFrontmatter(fs.readFileSync(mePath, 'utf8')).slice(0, 500);

let projectContext = '';
if (project && project.vault_readme) {
  const readmePath = path.join(registry.vault_root, project.vault_readme);
  if (fs.existsSync(readmePath)) {
    projectContext = stripFrontmatter(fs.readFileSync(readmePath, 'utf8')).slice(0, contextLimit);
  }
}

let dailySummary = `No ${section} entries yet today.`;
if (fs.existsSync(dailyPath)) {
  const dailyBody = stripFrontmatter(fs.readFileSync(dailyPath, 'utf8'));
  const sectionBody = sectionFromMarkdown(dailyBody, section);
  if (sectionBody) dailySummary = sectionBody.slice(0, 600);
}

const localSession = latestSessionFrom(cwd, registry.documents_root, project && project.source);

// `owner` is an optional registry field, e.g. "Sohaib | ML Engineer & Solopreneur".
const ownerLine = registry.owner ? `Owner: ${registry.owner}\n` : '';

let out = `[Vault Identity Loaded — ${cwd}]\n${ownerLine}Project: ${projectLabel}\nRegistry: ${REGISTRY_PATH}\nVault: ${registry.vault_root}\nDaily section: ${section}\n\n# Identity\n${meBody}\n`;

if (projectContext) {
  out += `\n# ${projectLabel} Context\n${projectContext}\n`;
}

out += `\n# Today — ${section}\n${dailySummary}\n`;

if (localSession) {
  out += `\n# Local session handoff\n${localSession}\n`;
}

process.stdout.write(out);
