#!/usr/bin/env node
/**
 * PostToolUse hook — append a timestamped entry to 00-Inbox/AI-ACTION-LOG.md
 * for any Write/Edit or structural Bash operation under the documents root.
 */

const fs = require('fs');
const path = require('path');
const { readRegistry, readStdinJson } = require('./_common');

const input = readStdinJson();

const registry = readRegistry();
if (!registry || !registry.documents_root) process.exit(0);

const toolName = input.tool_name || process.env.CLAUDE_TOOL_NAME || '';
const toolInput = input.tool_input || input;
const filePath = toolInput.file_path || '';
const command = toolInput.command || '';

const documentsRoot = registry.documents_root + path.sep;
const logPath = path.join(registry.documents_root, '00-Inbox', 'AI-ACTION-LOG.md');

const touchesDocuments = filePath.startsWith(documentsRoot) || command.includes(documentsRoot);
if (!touchesDocuments) process.exit(0);
if (filePath === logPath) process.exit(0);

const timestamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
let entry = '';

if (toolName === 'Write') {
  entry = `- ${timestamp} — WRITE: ${path.relative(registry.documents_root, filePath)}`;
} else if (toolName === 'Edit' || toolName === 'MultiEdit') {
  entry = `- ${timestamp} — EDIT:  ${path.relative(registry.documents_root, filePath)}`;
} else if (toolName === 'Bash' && /\b(rm|mv|cp|mkdir|rmdir)\b/.test(command)) {
  entry = `- ${timestamp} — BASH:  ${command.slice(0, 120)}`;
}

if (!entry) process.exit(0);

try {
  fs.appendFileSync(logPath, `${entry}\n`);
} catch (_) {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.writeFileSync(logPath, `# AI Action Log\n\n${entry}\n`);
}
