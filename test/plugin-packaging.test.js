const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const test = require('node:test');

const root = path.join(__dirname, '..');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

test('has Claude Code plugin manifest', () => {
  const manifest = readJson('.claude-plugin/plugin.json');
  assert.equal(manifest.name, 'sos-memory');
  assert.equal(manifest.displayName, 'SOS Memory');
  assert.equal(manifest.version, '0.1.0');
});

test('has Codex plugin manifest with shared component paths', () => {
  const manifest = readJson('.codex-plugin/plugin.json');
  assert.equal(manifest.name, 'sos-memory');
  assert.equal(manifest.skills, './skills/');
  assert.equal(manifest.hooks, './hooks/hooks.json');
  assert.equal(manifest.interface.displayName, 'SOS Memory');
});

test('has Claude hook config using plugin root variable', () => {
  const hooks = readJson('hooks/hooks.json');
  const command = hooks.hooks.PostToolUse[0].hooks[0].command;
  assert.match(command, /\$\{CLAUDE_PLUGIN_ROOT\}/);
  assert.match(command, /sos-health-check\.js/);
  assert.match(command, /--hook --repair/);
});

test('has Claude slash command files', () => {
  const commands = [
    'sos-health.md',
    'sos-install.md',
    'sos-validate.md',
    'sos-bootstrap-project.md',
    'sos-update-qmd.md',
    'sos-embed.md'
  ];

  for (const command of commands) {
    assert.equal(fs.existsSync(path.join(root, 'commands', command)), true, command);
  }
});
