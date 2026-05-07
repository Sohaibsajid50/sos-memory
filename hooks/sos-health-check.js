#!/usr/bin/env node

const { healthCheck } = require('../src/health-check');

healthCheck({ repair: process.argv.includes('--repair') }).catch((error) => {
  console.error(`[sos-health] ${error.message}`);
  process.exitCode = 1;
});
