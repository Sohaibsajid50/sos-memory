#!/usr/bin/env node

const path = require('path');
const { appendLine, readRegistry } = require('./_common');

const registry = readRegistry();
if (!registry) process.exit(0);

const actionLog = path.join(registry.documents_root, '00-Inbox', 'AI-ACTION-LOG.md');
appendLine(actionLog, `- ${new Date().toISOString()}: SOS hook action logged.`);
