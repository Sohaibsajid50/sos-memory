const assert = require('node:assert/strict');
const fs = require('fs/promises');
const path = require('path');
const test = require('node:test');

test('hook templates do not hardcode a user home path', async () => {
  const hooksDir = path.join(__dirname, '..', 'hooks');
  const files = await fs.readdir(hooksDir);

  for (const file of files.filter((name) => name.endsWith('.js'))) {
    const content = await fs.readFile(path.join(hooksDir, file), 'utf8');
    assert.equal(content.includes('/Users/ss'), false, `${file} contains a hardcoded user path`);
  }
});

test('adapter templates document QMD retrieval and embedding rules', async () => {
  const adaptersDir = path.join(__dirname, '..', 'templates', 'adapters');
  const files = ['CLAUDE.md', 'AGENTS.md', 'GEMINI.md'];

  for (const file of files) {
    const content = await fs.readFile(path.join(adaptersDir, file), 'utf8');
    assert.match(content, /qmd query/);
    assert.match(content, /qmd search/);
    assert.match(content, /sos embed|embeddings/);
  }
});
