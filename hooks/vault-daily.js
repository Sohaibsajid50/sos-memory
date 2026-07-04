#!/usr/bin/env node
/**
 * SessionStart hook — create/extend today's vault daily note for the resolved
 * project section, and detect unregistered numbered folders as pending projects.
 */

const fs = require('fs');
const path = require('path');
const { isInside, normalizePath, readRegistry, resolveProject, todayIso } = require('./_common');

function slugFor(folderName) {
  return folderName
    .toLowerCase()
    .replace(/^\d+-/, '')
    .replace(/_/g, '-')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function titleFor(folderName) {
  return folderName
    .replace(/^\d+-/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function detectPendingProjects(registry) {
  if (!registry.pending_root || !registry.documents_root) return [];
  try {
    fs.mkdirSync(registry.pending_root, { recursive: true });
  } catch (error) {
    process.stderr.write(`[vault-daily] Pending project scan skipped: ${error.message}\n`);
    return [];
  }

  const registeredSources = new Set(
    registry.projects.map((project) => normalizePath(project.source))
  );
  const children = fs.readdirSync(registry.documents_root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^(0[1-9]|[1-9][0-9])-/.test(entry.name));

  const created = [];
  for (const child of children) {
    const source = path.join(registry.documents_root, child.name);
    if (registeredSources.has(normalizePath(source))) continue;

    const slug = slugFor(child.name);
    const pendingPath = path.join(registry.pending_root, `${slug}.json`);
    if (fs.existsSync(pendingPath)) continue;

    const pending = {
      status: 'pending',
      detected_at: new Date().toISOString(),
      folder: child.name,
      source,
      suggested_id: slug,
      suggested_label: titleFor(child.name),
      suggested_command: `bootstrap project memory ${child.name}`
    };

    try {
      fs.writeFileSync(pendingPath, `${JSON.stringify(pending, null, 2)}\n`);
      created.push(child.name);
    } catch (error) {
      process.stderr.write(`[vault-daily] Could not write pending artifact for ${child.name}: ${error.message}\n`);
    }
  }
  return created;
}

const registry = readRegistry();
if (!registry) process.exit(0);

const cwd = process.cwd();
if (!isInside(cwd, registry.documents_root)) process.exit(0);

for (const folder of detectPendingProjects(registry)) {
  process.stdout.write(`[vault-daily] Detected unregistered project ${folder}; run: bootstrap project memory ${folder}\n`);
}

const project = resolveProject(registry, cwd);
const section = project ? project.daily_section : 'General';
const today = todayIso();
const dailyDir = path.join(registry.vault_root, 'Daily');
const dailyPath = path.join(dailyDir, `${today}.md`);

fs.mkdirSync(dailyDir, { recursive: true });

if (!fs.existsSync(dailyPath)) {
  const content = `---\ntype: daily-note\ndate: ${today}\n---\n# ${today}\n\n## ${section}\n<!-- session started -->\n\n`;
  fs.writeFileSync(dailyPath, content);
  process.stdout.write(`[vault-daily] Created ${today}.md — ## ${section} section ready\n`);
  process.exit(0);
}

let existing = fs.readFileSync(dailyPath, 'utf8');
const sectionHeader = `## ${section}`;
if (!existing.includes(sectionHeader)) {
  existing = `${existing.trimEnd()}\n\n## ${section}\n<!-- session started -->\n`;
  fs.writeFileSync(dailyPath, existing);
  process.stdout.write(`[vault-daily] Added ## ${section} section to ${today}.md\n`);
} else {
  process.stdout.write(`[vault-daily] ${today}.md ready — ## ${section} exists\n`);
}
