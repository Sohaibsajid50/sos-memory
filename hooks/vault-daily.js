#!/usr/bin/env node

const path = require('path');
const { appendLine, readRegistry, todayName } = require('./_common');

const registry = readRegistry();
if (!registry) process.exit(0);

const dailyPath = path.join(registry.vault_root, 'Daily', todayName());
appendLine(dailyPath, `\n## Agent Session\n- ${new Date().toISOString()}: Session touched this workspace.`);
