#!/usr/bin/env node

const path = require('path');
const { readRegistry } = require('./_common');

const registry = readRegistry();
if (!registry) process.exit(0);

console.log(`Vault identity: ${path.join(registry.vault_root, 'Context', 'me.md')}`);
