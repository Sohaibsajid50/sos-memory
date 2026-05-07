const fs = require('fs/promises');
const path = require('path');

async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

function timestamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\..+/, 'Z');
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function backupFile(target, backupRoot) {
  if (!(await exists(target))) return null;

  const relativeName = target.replaceAll(path.sep, '__').replace(/^__/, '');
  const backupPath = path.join(backupRoot, `${relativeName}.${timestamp()}.bak`);
  await ensureDir(path.dirname(backupPath));
  await fs.copyFile(target, backupPath);
  return backupPath;
}

async function writeFileWithBackup(target, content, options = {}) {
  const { backupRoot, dryRun = false, mode } = options;
  const backupPath = backupRoot ? await backupFile(target, backupRoot) : null;

  if (!dryRun) {
    await ensureDir(path.dirname(target));
    await fs.writeFile(target, content, { mode });
  }

  return { backupPath, target };
}

async function readJson(target) {
  return JSON.parse(await fs.readFile(target, 'utf8'));
}

async function writeJsonWithBackup(target, data, options = {}) {
  return writeFileWithBackup(target, `${JSON.stringify(data, null, 2)}\n`, options);
}

module.exports = {
  backupFile,
  ensureDir,
  exists,
  readJson,
  timestamp,
  writeFileWithBackup,
  writeJsonWithBackup
};
