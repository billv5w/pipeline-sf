#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function setup() {
  console.log('\n==============================================');
  console.log('Salesforce Event-Driven Pipeline Setup');
  console.log('==============================================\n');

  try {
    // Check if .env exists
    const envPath = path.join(process.cwd(), '.env');
    let envExists = false;

    try {
      await fs.access(envPath);
      envExists = true;
      console.log('⚠️  .env file already exists.');
      const overwrite = await question('Do you want to overwrite it? (yes/no): ');

      if (overwrite.toLowerCase() !== 'yes') {
        console.log('Setup cancelled.');
        rl.close();
        return;
      }
    } catch (error) {
      // File doesn't exist, continue
    }

    // Collect credentials
    console.log('\n--- Salesforce Credentials ---');
    const username = await question('Salesforce Username: ');
    const password = await question('Salesforce Password: ');
    const securityToken = await question('Security Token (optional): ');
    const loginUrl = await question('Login URL (default: https://login.salesforce.com): ') || 'https://login.salesforce.com';

    console.log('\n--- Pipeline Configuration ---');
    const pipelineMode = await question('Pipeline Mode (monitor/manual) [default: monitor]: ') || 'monitor';
    const logLevel = await question('Log Level (debug/info/warn/error) [default: info]: ') || 'info';

    console.log('\n--- Git Configuration ---');
    const gitAuthorName = await question('Git Author Name [default: Salesforce Pipeline Bot]: ') || 'Salesforce Pipeline Bot';
    const gitAuthorEmail = await question('Git Author Email [default: pipeline@example.com]: ') || 'pipeline@example.com';

    // Create .env file
    const envContent = `# Salesforce Credentials
SF_USERNAME=${username}
SF_PASSWORD=${password}
SF_SECURITY_TOKEN=${securityToken}
SF_LOGIN_URL=${loginUrl}

# Pipeline Configuration
PIPELINE_MODE=${pipelineMode}
LOG_LEVEL=${logLevel}

# Git Configuration
GIT_AUTHOR_NAME=${gitAuthorName}
GIT_AUTHOR_EMAIL=${gitAuthorEmail}

# Optional: Slack Notifications
SLACK_WEBHOOK_URL=

# Optional: Custom API Version
SF_API_VERSION=59.0
`;

    await fs.writeFile(envPath, envContent);

    console.log('\n✅ .env file created successfully!');

    // Create necessary directories
    console.log('\nCreating necessary directories...');

    const directories = [
      'logs',
      'data/extracts',
      'data/versions',
      'data/snapshots',
      'data/temp',
      'manifest'
    ];

    for (const dir of directories) {
      await fs.mkdir(path.join(process.cwd(), dir), { recursive: true });
      console.log(`  ✓ Created ${dir}/`);
    }

    // Create a basic package.xml if it doesn't exist
    const manifestPath = path.join(process.cwd(), 'manifest', 'package.xml');

    try {
      await fs.access(manifestPath);
    } catch (error) {
      const packageXml = `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
        <members>*</members>
        <name>ApexClass</name>
    </types>
    <types>
        <members>*</members>
        <name>ApexTrigger</name>
    </types>
    <types>
        <members>*</members>
        <name>CustomObject</name>
    </types>
    <types>
        <members>*</members>
        <name>CustomField</name>
    </types>
    <types>
        <members>*</members>
        <name>Layout</name>
    </types>
    <types>
        <members>*</members>
        <name>PermissionSet</name>
    </types>
    <types>
        <members>*</members>
        <name>Profile</name>
    </types>
    <types>
        <members>*</members>
        <name>Flow</name>
    </types>
    <version>59.0</version>
</Package>
`;

      await fs.writeFile(manifestPath, packageXml);
      console.log('  ✓ Created manifest/package.xml');
    }

    console.log('\n==============================================');
    console.log('Setup Complete! 🎉');
    console.log('==============================================\n');

    console.log('Next steps:');
    console.log('1. Install dependencies: npm install');
    console.log('2. Authenticate with Salesforce: sf org login web');
    console.log('3. Start the pipeline: npm start');
    console.log('\nFor more information, see the README.md file.\n');

    rl.close();
  } catch (error) {
    console.error('\n❌ Setup failed:', error.message);
    rl.close();
    process.exit(1);
  }
}

setup();
