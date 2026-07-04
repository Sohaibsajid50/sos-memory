const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const skillPath = path.join(__dirname, '..', 'skills', 'sos-setup', 'SKILL.md');

test('sos-setup skill exists with frontmatter description', () => {
  const content = fs.readFileSync(skillPath, 'utf8');
  assert.match(content, /^---\nname: sos-setup\n/);
  assert.match(content, /description: .*onboarding/i);
});

test('sos-setup skill enforces AskUserQuestion label+description rule', () => {
  const content = fs.readFileSync(skillPath, 'utf8');
  assert.match(content, /AskUserQuestion/);
  assert.match(content, /`label` AND `description`/);
  assert.match(content, /No AskUserQuestion available/i);
});

test('sos-setup skill warns about macOS permission pop-ups before scheduling', () => {
  const content = fs.readFileSync(skillPath, 'utf8');
  assert.match(content, /Node wants to access Documents/);
  assert.match(content, /BEFORE/);
});

test('sos-setup skill verifies with doctor and never overwrites memory', () => {
  const content = fs.readFileSync(skillPath, 'utf8');
  assert.match(content, /sos\.js doctor/);
  assert.match(content, /Never overwrite existing memory/);
});

test('sos-setup slash command invokes the skill', () => {
  const command = fs.readFileSync(path.join(__dirname, '..', 'commands', 'sos-setup.md'), 'utf8');
  assert.match(command, /sos-setup/);
  assert.match(command, /AskUserQuestion/);
});
