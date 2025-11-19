# Setup Guide

Complete guide to setting up the Salesforce Event-Driven Data DevOps Pipeline.

## Prerequisites

### Required Software

1. **Node.js** (v18 or higher)
   ```bash
   node --version
   # Should output v18.x.x or higher
   ```

2. **Salesforce CLI** (latest version)
   ```bash
   npm install -g @salesforce/cli
   sf --version
   ```

3. **Git**
   ```bash
   git --version
   ```

### Salesforce Requirements

1. **API Access**: Your Salesforce org must have API enabled
2. **Permissions**: Your user needs:
   - API Enabled
   - View Setup and Configuration
   - Modify All Data (for data extraction)
   - Author Apex (for metadata deployment)

3. **Features** (for full functionality):
   - Change Data Capture enabled
   - Platform Events (if using custom events)

## Step-by-Step Setup

### 1. Clone and Install

```bash
# Clone the repository
git clone <your-repo-url>
cd pipeline-sf

# Install dependencies
npm install
```

### 2. Run Setup Wizard

```bash
npm run setup
```

The wizard will prompt you for:
- Salesforce credentials
- Pipeline configuration
- Git settings

### 3. Manual Configuration (Alternative)

If you prefer manual setup, copy and edit the environment file:

```bash
cp .env.example .env
```

Edit `.env` with your settings:

```bash
# Salesforce Credentials
SF_USERNAME=your-username@example.com
SF_PASSWORD=your-password
SF_SECURITY_TOKEN=your-security-token
SF_LOGIN_URL=https://login.salesforce.com

# For sandbox, use:
# SF_LOGIN_URL=https://test.salesforce.com

# Pipeline Configuration
PIPELINE_MODE=monitor
LOG_LEVEL=info

# Git Configuration
GIT_AUTHOR_NAME=Salesforce Pipeline Bot
GIT_AUTHOR_EMAIL=pipeline@example.com
```

### 4. Authenticate with Salesforce

```bash
# Web-based authentication (recommended)
sf org login web --alias my-org --set-default

# Or use auth URL (for CI/CD)
sf org login sfdx-url --sfdx-url-file authurl.txt --alias my-org
```

### 5. Configure Change Data Capture (Optional)

If you want real-time data change tracking:

1. Go to Salesforce Setup
2. Search for "Change Data Capture"
3. Select entities to track (Account, Contact, etc.)
4. Click "Save"

Update `config/default.json`:

```json
{
  "events": {
    "changeDataCapture": {
      "enabled": true,
      "objects": [
        "Account",
        "Contact",
        "Opportunity"
      ]
    }
  }
}
```

### 6. Customize Configuration

Edit `config/default.json` to match your needs:

```json
{
  "pipeline": {
    "name": "My Salesforce Pipeline",
    "enableMetadataTracking": true,
    "enableDataTracking": true,
    "autoCommit": true,
    "autoDeploy": false
  },
  "monitoring": {
    "metadataPollingInterval": 300000,  // 5 minutes
    "dataPollingInterval": 60000        // 1 minute
  },
  "dataExtraction": {
    "objects": [
      "Account",
      "Contact",
      "Opportunity",
      "Lead",
      "Case"
    ]
  }
}
```

### 7. Test the Installation

```bash
# Test data extraction
npm run extract-data

# Test metadata monitoring
npm run monitor

# Run tests
npm test
```

### 8. Start the Pipeline

```bash
npm start
```

You should see output like:

```
Starting Salesforce Event-Driven Pipeline...
Connected to Salesforce org
Pipeline started successfully
Pipeline is running. Press Ctrl+C to stop.
```

## GitHub Actions Setup

### 1. Add Repository Secrets

Go to your GitHub repository settings and add these secrets:

**Salesforce Credentials**:
- `SF_USERNAME`: Your Salesforce username
- `SF_PASSWORD`: Your Salesforce password
- `SF_SECURITY_TOKEN`: Your Salesforce security token
- `SF_LOGIN_URL`: Login URL (https://login.salesforce.com or https://test.salesforce.com)

**For Production Deployments**:
- `SF_PROD_USERNAME`: Production username
- `SF_PROD_PASSWORD`: Production password
- `SF_PROD_SECURITY_TOKEN`: Production security token

**Git Configuration**:
- `GIT_AUTHOR_NAME`: Bot name for commits
- `GIT_AUTHOR_EMAIL`: Bot email for commits

### 2. Enable Workflows

GitHub Actions workflows are in `.github/workflows/`. They will run automatically based on their triggers:

- `metadata-sync.yml`: Every 6 hours + manual
- `validate-deploy.yml`: On PR and merge to main
- `data-backup.yml`: Daily at 2 AM UTC + manual
- `test.yml`: On every push

### 3. Manual Trigger

To manually trigger a workflow:

1. Go to "Actions" tab in GitHub
2. Select the workflow
3. Click "Run workflow"
4. Select branch and parameters

## Advanced Configuration

### Using OAuth Instead of Username/Password

1. Create a Connected App in Salesforce
2. Obtain client ID, client secret, and refresh token
3. Update `.env`:

```bash
# OAuth Configuration
SF_CLIENT_ID=your-client-id
SF_CLIENT_SECRET=your-client-secret
SF_REFRESH_TOKEN=your-refresh-token
SF_LOGIN_URL=https://login.salesforce.com
```

### Multi-Environment Setup

Create environment-specific configuration files:

```bash
config/
├── default.json          # Base configuration
├── development.json      # Dev overrides
├── staging.json          # Staging overrides
└── production.json       # Production overrides
```

Load specific config:

```bash
NODE_ENV=production npm start
```

### Custom Metadata Package

Create a custom `manifest/package.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
        <members>MyCustomObject__c</members>
        <name>CustomObject</name>
    </types>
    <types>
        <members>MyApexClass</members>
        <name>ApexClass</name>
    </types>
    <version>59.0</version>
</Package>
```

### Slack Notifications

1. Create a Slack webhook URL
2. Add to `.env`:

```bash
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

3. Enable in `config/default.json`:

```json
{
  "notifications": {
    "slack": {
      "enabled": true,
      "webhookUrl": "${SLACK_WEBHOOK_URL}"
    }
  }
}
```

## Troubleshooting

### Authentication Fails

**Problem**: "Invalid username, password, security token; or user locked out"

**Solution**:
1. Verify credentials in `.env`
2. Check if IP is whitelisted in Salesforce
3. Reset security token if needed
4. Try web auth: `sf org login web`

### Metadata Retrieval Fails

**Problem**: "ERROR: An unexpected error occurred while retrieving metadata"

**Solution**:
1. Check `manifest/package.xml` syntax
2. Verify user has "View Setup and Configuration" permission
3. Try retrieving specific metadata types:
   ```bash
   sf project retrieve start --metadata ApexClass
   ```

### CDC Not Working

**Problem**: No CDC events received

**Solution**:
1. Verify CDC is enabled in Setup
2. Check objects are selected for CDC
3. Verify streaming API limits not exceeded
4. Check logs for connection errors:
   ```bash
   tail -f logs/event-listener.log
   ```

### Out of API Calls

**Problem**: "API REQUEST LIMIT EXCEEDED"

**Solution**:
1. Reduce polling frequency in config
2. Use CDC instead of polling where possible
3. Optimize queries to use fewer API calls
4. Consider upgrading your Salesforce edition

### Data Extraction Fails

**Problem**: "Error extracting data from [Object]"

**Solution**:
1. Check user has read access to object
2. Verify object exists in org
3. Check field-level security
4. Reduce batch size if timeout occurs

## Validation Checklist

- [ ] Node.js 18+ installed
- [ ] Salesforce CLI installed
- [ ] Git installed
- [ ] Repository cloned
- [ ] Dependencies installed (`npm install`)
- [ ] `.env` file configured
- [ ] Salesforce authentication successful
- [ ] CDC enabled (if using)
- [ ] Configuration customized
- [ ] Tests pass (`npm test`)
- [ ] Pipeline starts without errors
- [ ] GitHub secrets configured (if using Actions)

## Next Steps

After successful setup:

1. **Test thoroughly**: Run through all features in a sandbox
2. **Monitor logs**: Watch for errors or warnings
3. **Customize workflows**: Add your own automation
4. **Set up monitoring**: Configure alerts and notifications
5. **Document**: Add any custom configurations to your team docs
6. **Train team**: Share knowledge with other developers

## Getting Help

- Check logs in `logs/` directory
- Review error messages carefully
- Search GitHub issues
- Consult Salesforce documentation
- Open an issue with:
  - Error messages
  - Log excerpts
  - Configuration (without credentials!)
  - Steps to reproduce
