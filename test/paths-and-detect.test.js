const assert = require('node:assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const test = require('node:test');
const { scanNumberedFolders } = require('../src/bootstrap');
const { detectQmd } = require('../src/detect');
const { getRepoRoot } = require('../src/paths');

async function tempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'sos-paths-'));
}

test('repo root is derived from cli entrypoint location', () => {
  const root = getRepoRoot(path.join(__dirname, '..', 'bin', 'sos.js'));
  assert.equal(path.basename(root), 'sos-memory');
});

test('numbered folder scanner excludes 00-* folders', async () => {
  const root = await tempDir();
  await fs.mkdir(path.join(root, '00-Inbox'));
  await fs.mkdir(path.join(root, '01-Client'));
  await fs.mkdir(path.join(root, '06-Workspace'));
  await fs.mkdir(path.join(root, 'misc'));

  const folders = await scanNumberedFolders(root);
  assert.deepEqual(folders.map((folder) => path.basename(folder)).sort(), ['01-Client', '06-Workspace']);
});

test('QMD detection returns guidance when unavailable from configured PATH', () => {
  const originalPath = process.env.PATH;
  process.env.PATH = '/definitely/missing';
  const result = detectQmd();
  process.env.PATH = originalPath;

  if (!result.found) {
    assert.equal(result.guidance, 'Install QMD: npm install -g @tobilu/qmd');
  }
});
