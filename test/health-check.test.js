const assert = require('node:assert/strict');
const test = require('node:test');
const {
  parseCollectionNames,
  parseContextNames,
  pendingEmbeddingCount
} = require('../src/health-check');
const { INSTALL_FILES } = require('../src/install');

test('parses QMD collection list output', () => {
  const output = `Collections (2):

vault (qmd://vault/)
  Pattern:  **/*.md

sales (qmd://sales/)
  Pattern:  **/*.md
`;

  assert.deepEqual([...parseCollectionNames(output)].sort(), ['sales', 'vault']);
});

test('parses QMD context list output', () => {
  const output = `
Configured Contexts

vault
  / (root)
    Personal knowledge base
sales
  / (root)
    Sales OS
`;

  assert.deepEqual([...parseContextNames(output)].sort(), ['sales', 'vault']);
});

test('parses pending embedding count', () => {
  assert.equal(pendingEmbeddingCount('Pending:  11 need embedding (run qmd embed)'), 11);
  assert.equal(pendingEmbeddingCount('Documents\n  Total: 273\n  Vectors: 895'), 0);
});

test('installer includes health-check hook', () => {
  assert.ok(INSTALL_FILES.some(([source]) => source === 'hooks/sos-health-check.js'));
});
