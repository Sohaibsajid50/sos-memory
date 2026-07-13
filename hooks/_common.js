const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const CLAUDE_CONFIG_DIR = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
const REGISTRY_PATH = process.env.SOS_REGISTRY_PATH || path.join(CLAUDE_CONFIG_DIR, 'projects.json');
const STATE_DIR = path.join(CLAUDE_CONFIG_DIR, 'cache');
// Scheduled jobs can lose vault write access (macOS TCC grants break on node
// upgrades). They stage writes here; session hooks flush them with full user
// permissions. Filename contract: <date>__<section>__<title>.md
const PENDING_DIGESTS_DIR = path.join(STATE_DIR, 'pending-digests');

function readRegistry() {
  if (!fs.existsSync(REGISTRY_PATH)) return null;
  const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
  if (registry.version !== 1 || !Array.isArray(registry.projects)) return null;
  return registry;
}

function normalizePath(value) {
  return path.resolve(value);
}

function isInside(targetPath, rootPath) {
  if (!rootPath) return false;
  const target = normalizePath(targetPath);
  const root = normalizePath(rootPath);
  return target === root || target.startsWith(root + path.sep);
}

/** Longest-source-match project resolution for a filesystem path. */
function resolveProject(registry, targetPath) {
  if (!targetPath) return null;
  return registry.projects
    .filter((project) => project.source && isInside(targetPath, project.source))
    .sort((a, b) => b.source.length - a.source.length)[0] || null;
}

function todayIso(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function todayName(date = new Date()) {
  return `${todayIso(date)}.md`;
}

function appendLine(filePath, line) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${line}\n`);
}

/** Read the hook JSON payload from stdin. fd 0 works on macOS/Linux/Windows. */
function readStdinJson() {
  try {
    return JSON.parse(fs.readFileSync(0, 'utf8'));
  } catch (_) {
    return {};
  }
}

const BINARY_CANDIDATE_DIRS = [
  path.join(os.homedir(), '.bun', 'bin'),
  path.join(os.homedir(), '.local', 'bin'),
  path.join(os.homedir(), '.npm-global', 'bin'),
  '/opt/homebrew/bin',
  '/usr/local/bin',
  '/usr/bin'
];

/** Find an executable by PATH lookup first, then well-known install dirs. */
function findBinary(name) {
  const lookup = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(lookup, [name], { encoding: 'utf8' });
  if (result.status === 0 && result.stdout.trim()) {
    return result.stdout.trim().split(/\r?\n/)[0];
  }
  const fileName = process.platform === 'win32' ? `${name}.exe` : name;
  return BINARY_CANDIDATE_DIRS
    .map((dir) => path.join(dir, fileName))
    .find((candidate) => fs.existsSync(candidate)) || null;
}

function readStateJson(stateFileName, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(path.join(STATE_DIR, stateFileName), 'utf8'));
  } catch (_) {
    return fallback;
  }
}

function writeStateJson(stateFileName, state) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(path.join(STATE_DIR, stateFileName), `${JSON.stringify(state, null, 2)}\n`);
}

/** Append a block under `## section` in the vault daily note for dateSlug. */
function appendToDailySection(vaultRoot, dateSlug, section, block) {
  const dailyDir = path.join(vaultRoot, 'Daily');
  fs.mkdirSync(dailyDir, { recursive: true });
  const notePath = path.join(dailyDir, `${dateSlug}.md`);
  let body = fs.existsSync(notePath) ? fs.readFileSync(notePath, 'utf8') : `# ${dateSlug}\n`;
  const header = `## ${section}`;
  if (!body.includes(header)) body = `${body.trimEnd()}\n\n${header}\n`;
  const sections = body.split(/^(?=## )/m);
  const index = sections.findIndex((chunk) => chunk.startsWith(header));
  sections[index] = `${sections[index].trimEnd()}\n${block}`;
  fs.writeFileSync(notePath, sections.join('\n'));
  return notePath;
}

/** Stage a daily-note block for later flush by a session hook. */
function stagePendingDigest(dateSlug, section, block) {
  fs.mkdirSync(PENDING_DIGESTS_DIR, { recursive: true });
  const fileName = `${dateSlug}__${section.replace(/[^A-Za-z0-9-]+/g, '_')}__${Date.now()}.md`;
  fs.writeFileSync(path.join(PENDING_DIGESTS_DIR, fileName), block);
  return fileName;
}

/** Flush staged digests into the vault. Call from user-context session hooks. */
function flushPendingDigests(vaultRoot) {
  let entries = [];
  try {
    entries = fs.readdirSync(PENDING_DIGESTS_DIR).filter((name) => name.endsWith('.md'));
  } catch (_) {
    return 0;
  }
  let flushed = 0;
  for (const name of entries.sort()) {
    const [dateSlug, sectionSlug] = name.split('__');
    if (!dateSlug || !sectionSlug) continue;
    const filePath = path.join(PENDING_DIGESTS_DIR, name);
    try {
      const block = fs.readFileSync(filePath, 'utf8');
      appendToDailySection(vaultRoot, dateSlug, sectionSlug.replace(/_/g, ' '), block);
      fs.unlinkSync(filePath);
      flushed += 1;
    } catch (_) {
      break; // vault still unwritable — leave the rest staged
    }
  }
  return flushed;
}

module.exports = {
  CLAUDE_CONFIG_DIR,
  PENDING_DIGESTS_DIR,
  REGISTRY_PATH,
  STATE_DIR,
  appendToDailySection,
  flushPendingDigests,
  stagePendingDigest,
  appendLine,
  findBinary,
  isInside,
  normalizePath,
  readRegistry,
  readStateJson,
  readStdinJson,
  resolveProject,
  todayIso,
  todayName,
  writeStateJson
};
