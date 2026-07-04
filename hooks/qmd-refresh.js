#!/usr/bin/env node
/**
 * PostToolUse hook — refresh the QMD collection for the registry-resolved
 * project when a Write/Edit/Bash operation touches its files.
 */

const path = require('path');
const { spawn } = require('child_process');
const { findBinary, readRegistry, readStdinJson, resolveProject } = require('./_common');

const input = readStdinJson();

const registry = readRegistry();
if (!registry) process.exit(0);

const qmdBin = findBinary('qmd');
if (!qmdBin) process.exit(0);

const toolName = input.tool_name || process.env.CLAUDE_TOOL_NAME || '';
const toolInput = input.tool_input || input;
const cwd = input.cwd || process.cwd();
const filePath = toolInput.file_path || '';
const command = toolInput.command || '';

function collectionFor(targetPath) {
  if (!targetPath) return null;
  const absolutePath = path.isAbsolute(targetPath) ? targetPath : path.resolve(cwd, targetPath);
  const project = resolveProject(registry, absolutePath);
  return project && project.qmd_collection ? project.qmd_collection : null;
}

/** First path in a shell command that lives under the documents root. */
function firstDocumentsPath(commandText) {
  const root = registry.documents_root;
  const tokens = commandText.split(/[\s'"]+/).filter(Boolean);
  const absolute = tokens.find((token) => token.startsWith(root + path.sep) || token === root);
  if (absolute) return absolute;
  const relative = tokens.find((token) => /^(\.\/)?\d{2}-[^\s]+/.test(token));
  return relative ? path.resolve(cwd, relative.replace(/^\.\//, '')) : null;
}

let collection = null;

if (['Write', 'Edit', 'MultiEdit'].includes(toolName)) {
  collection = collectionFor(filePath);
}

if (toolName === 'Bash' && /\b(rm|mv|cp|mkdir|touch)\b/.test(command)) {
  collection = collectionFor(firstDocumentsPath(command));
}

if (!collection) process.exit(0);

const proc = spawn(qmdBin, ['update', collection], {
  detached: true,
  stdio: 'ignore'
});
proc.unref();
