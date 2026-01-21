#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('InboxGPT Setup Script');
console.log('=====================\n');

// Check if .env exists
const envPath = path.join(__dirname, '..', '.env');
const envExamplePath = path.join(__dirname, '..', '.env.example');

if (!fs.existsSync(envPath)) {
  console.log('Creating .env file from .env.example...');
  if (fs.existsSync(envExamplePath)) {
    fs.copyFileSync(envExamplePath, envPath);
    console.log('Created .env file. Please update it with your credentials.\n');
  } else {
    console.error('ERROR: .env.example not found!');
    process.exit(1);
  }
}

// Create data directory
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  console.log('Creating data directory...');
  fs.mkdirSync(dataDir, { recursive: true });
  console.log('Created data directory.\n');
}

console.log('Setup complete!\n');
console.log('Next steps:');
console.log('1. Update .env with your API keys and secrets');
console.log('2. Run: npm run db:push');
console.log('3. Run: npm run dev');
console.log('4. Open http://localhost:3000');
