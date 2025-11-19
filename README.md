# Salesforce Event-Driven Data DevOps Pipeline

A comprehensive, event-driven data DevOps pipeline for Salesforce that automates metadata synchronization, data extraction, versioning, and deployment workflows.

## Features

- **Event-Driven Architecture**: Real-time monitoring of Salesforce changes using Platform Events and Change Data Capture (CDC)
- **Metadata Tracking**: Automatic detection and synchronization of metadata changes
- **Data Extraction & Versioning**: Version-controlled data backups with delta tracking
- **CI/CD Integration**: GitHub Actions workflows for automated validation and deployment
- **Pipeline Orchestration**: Flexible workflow engine for custom automation
- **No Paid Tools**: Built entirely with free and open-source tools

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Salesforce Org                           │
│  ┌──────────────┐  ┌─────────────┐  ┌──────────────┐      │
│  │   Metadata   │  │  Platform   │  │    Change    │      │
│  │   Changes    │  │   Events    │  │ Data Capture │      │
│  └──────┬───────┘  └──────┬──────┘  └──────┬───────┘      │
└─────────┼──────────────────┼─────────────────┼─────────────┘
          │                  │                 │
          ▼                  ▼                 ▼
┌─────────────────────────────────────────────────────────────┐
│                Event-Driven Pipeline                        │
│  ┌──────────────┐  ┌─────────────┐  ┌──────────────┐      │
│  │   Metadata   │  │    Event    │  │     Data     │      │
│  │   Monitor    │  │  Listener   │  │  Extractor   │      │
│  └──────┬───────┘  └──────┬──────┘  └──────┬───────┘      │
│         │                  │                 │              │
│         └──────────────────┼─────────────────┘              │
│                            ▼                                │
│                  ┌──────────────────┐                       │
│                  │   Orchestrator   │                       │
│                  └─────────┬────────┘                       │
│                            │                                │
│         ┌──────────────────┼──────────────────┐            │
│         ▼                  ▼                  ▼            │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐      │
│  │ Versioning  │  │ Deployment   │  │ Workflows   │      │
│  └─────────────┘  └──────────────┘  └─────────────┘      │
└─────────────────────────────────────────────────────────────┘
          │                  │                 │
          ▼                  ▼                 ▼
┌─────────────────────────────────────────────────────────────┐
│              Git Repository & CI/CD                         │
│  ┌──────────────┐  ┌─────────────┐  ┌──────────────┐      │
│  │   Metadata   │  │    Data     │  │   GitHub     │      │
│  │   Tracking   │  │  Backups    │  │   Actions    │      │
│  └──────────────┘  └─────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

## Key Components

### 1. Metadata Monitor
Automatically tracks metadata changes in your Salesforce org:
- Polls SetupAuditTrail for changes
- Retrieves updated metadata using SFDX
- Commits changes to Git

### 2. Event Listener
Subscribes to real-time Salesforce events:
- Platform Events for custom events
- Change Data Capture for data changes
- Triggers automated workflows

### 3. Data Extractor
Extracts and versions Salesforce data:
- Bulk data extraction
- Incremental change extraction
- Compression and versioning

### 4. Pipeline Orchestrator
Coordinates workflows and automation:
- Workflow registration and execution
- Job tracking and history
- Event-driven triggers

### 5. Deployment Manager
Handles deployments to target orgs:
- Validation and check-only deploys
- Quick deploys
- Rollback capabilities

## Installation

### Prerequisites

- Node.js 18+
- Salesforce CLI (`sf`)
- Git
- A Salesforce org with API access

### Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd pipeline-sf
```

2. Install dependencies:
```bash
npm install
```

3. Run the setup script:
```bash
npm run setup
```

This will guide you through configuring:
- Salesforce credentials
- Pipeline settings
- Git configuration

4. Authenticate with Salesforce:
```bash
sf org login web --alias my-org
```

## Usage

### Start the Pipeline

Run the complete pipeline with monitoring and event listeners:

```bash
npm start
```

### Individual Services

Run specific services independently:

```bash
# Metadata monitoring only
npm run monitor

# Event listener only
npm run listener

# Data extraction
npm run extract-data
```

### Trigger Workflows

Manually trigger workflows:

```bash
# Trigger metadata sync
node src/index.js trigger metadata-sync

# Trigger data extraction
node src/index.js trigger data-extract '{"objects":["Account","Contact"]}'

# Trigger full sync
node src/index.js trigger full-sync

# Deploy to target org
node src/index.js trigger deploy '{"targetOrg":"my-org","checkOnly":true}'
```

### Deployment

Deploy to a target org:

```bash
# Validate deployment (check-only)
node src/pipeline/deploy.js my-org --check-only

# Deploy to org
node src/pipeline/deploy.js my-org
```

## Configuration

Edit `config/default.json` to customize the pipeline:

```json
{
  "pipeline": {
    "enableMetadataTracking": true,
    "enableDataTracking": true,
    "autoCommit": true,
    "autoDeploy": false
  },
  "monitoring": {
    "metadataPollingInterval": 300000,
    "dataPollingInterval": 60000
  },
  "events": {
    "changeDataCapture": {
      "enabled": true,
      "objects": ["Account", "Contact", "Opportunity"]
    }
  }
}
```

## CI/CD Workflows

The pipeline includes several GitHub Actions workflows:

### Metadata Sync
Automatically syncs metadata on a schedule or when triggered:
- Runs every 6 hours
- Can be manually triggered
- Commits changes to Git

### Validate and Deploy
Validates pull requests and deploys to production:
- Validates on PR creation
- Runs tests
- Deploys to production on merge to main

### Data Backup
Daily automated data backups:
- Runs daily at 2 AM UTC
- Commits data to Git
- Creates backup artifacts

### Testing
Runs tests on every push:
- Unit tests
- Linting
- Coverage reporting

## Environment Variables

Required environment variables (see `.env.example`):

```bash
# Salesforce Credentials
SF_USERNAME=your-username@example.com
SF_PASSWORD=your-password
SF_SECURITY_TOKEN=your-security-token
SF_LOGIN_URL=https://login.salesforce.com

# Pipeline Configuration
PIPELINE_MODE=monitor
LOG_LEVEL=info

# Git Configuration
GIT_AUTHOR_NAME=Salesforce Pipeline Bot
GIT_AUTHOR_EMAIL=pipeline@example.com
```

## Data Versioning

The pipeline includes a robust data versioning system:

```javascript
const DataVersioning = require('./src/services/data-versioning');
const versioning = new DataVersioning(config);

// Create a snapshot
await versioning.createSnapshot('Account', accountData);

// Compare versions
const diff = await versioning.compareVersions('Account', 1, 2);

// Rollback to previous version
await versioning.rollback('Account', 1);

// List all versions
const versions = await versioning.listVersions('Account');
```

## Custom Workflows

Register custom workflows with the orchestrator:

```javascript
orchestrator.registerWorkflow('my-workflow', async (context) => {
  // Step 1: Extract data
  const data = await dataExtractor.extractAll();

  // Step 2: Transform data
  const transformed = transformData(data);

  // Step 3: Deploy to target org
  await deployer.deploy(context.targetOrg);

  return { success: true, data: transformed };
});

// Trigger the workflow
await orchestrator.triggerWorkflow('my-workflow', { targetOrg: 'my-org' });
```

## Testing

Run the test suite:

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# With coverage
npm test -- --coverage
```

## Project Structure

```
pipeline-sf/
├── .github/
│   └── workflows/          # GitHub Actions workflows
├── config/
│   └── default.json        # Pipeline configuration
├── force-app/              # Salesforce metadata
│   └── main/default/
├── src/
│   ├── index.js           # Main entry point
│   ├── pipeline/
│   │   ├── orchestrator.js # Workflow orchestration
│   │   └── deploy.js       # Deployment manager
│   └── services/
│       ├── event-listener.js    # Platform Events & CDC
│       ├── metadata-monitor.js  # Metadata tracking
│       ├── data-extractor.js    # Data extraction
│       ├── data-versioning.js   # Version control
│       └── cdc-handler.js       # CDC processing
├── scripts/
│   └── setup.js           # Setup wizard
├── tests/                 # Test files
├── data/                  # Data extracts and versions
├── logs/                  # Application logs
└── manifest/              # SFDX manifests
```

## Troubleshooting

### Connection Issues

If you encounter authentication errors:

```bash
# Re-authenticate
sf org login web --alias my-org

# Check current connections
sf org list
```

### Metadata Retrieval Fails

Ensure `manifest/package.xml` includes all necessary metadata types.

### CDC Not Receiving Events

1. Enable Change Data Capture in Salesforce Setup
2. Select objects to track
3. Verify event subscriptions in logs

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests: `npm test`
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For issues, questions, or contributions, please open an issue on GitHub.

## Roadmap

- [ ] Slack/Teams notification integration
- [ ] Web dashboard for monitoring
- [ ] Support for additional version control systems
- [ ] Enhanced data masking for sandbox refreshes
- [ ] Multi-org synchronization
- [ ] Custom reporting and analytics
