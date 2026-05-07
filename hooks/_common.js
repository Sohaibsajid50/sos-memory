const fs = require('fs');
const os = require('os');
const path = require('path');

const REGISTRY_PATH = path.join(
  process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'),
  'projects.json'
);

function readRegistry() {
  if (!fs.existsSync(REGISTRY_PATH)) return null;
  const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
  if (registry.version !== 1) return null;
  return registry;
}

function todayName(date = new Date()) {
  return `${date.toISOString().slice(0, 10)}.md`;
}

function appendLine(filePath, line) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${line}\n`);
}

module.exports = {
  REGISTRY_PATH,
  appendLine,
  readRegistry,
  todayName
};
