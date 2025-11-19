# Architecture Overview

## Event-Driven Data DevOps Pipeline

This document describes the architecture and design principles of the Salesforce Event-Driven Data DevOps Pipeline.

## Core Principles

1. **Event-Driven**: Reacts to changes in real-time rather than batch processing
2. **Modular**: Components can be used independently or together
3. **Scalable**: Designed to handle large volumes of metadata and data
4. **Version-Controlled**: All changes tracked in Git
5. **Automated**: Minimal manual intervention required

## System Components

### 1. Event Sources

#### Salesforce Org
- **SetupAuditTrail**: Tracks metadata changes
- **Platform Events**: Custom event notifications
- **Change Data Capture**: Real-time data change events

### 2. Core Services

#### Metadata Monitor (`src/services/metadata-monitor.js`)
**Purpose**: Tracks and synchronizes metadata changes

**Flow**:
1. Poll SetupAuditTrail for changes
2. Retrieve updated metadata using SFDX
3. Detect local file changes
4. Commit changes to Git (if enabled)

**Key Features**:
- Configurable polling interval
- Automatic retry on failures
- Git integration
- Audit trail tracking

#### Event Listener (`src/services/event-listener.js`)
**Purpose**: Subscribe to real-time Salesforce events

**Flow**:
1. Establish streaming connection to Salesforce
2. Subscribe to Platform Events and CDC channels
3. Emit events to registered handlers
4. Maintain persistent connections

**Key Features**:
- Platform Events support
- Change Data Capture support
- Event buffering
- Automatic reconnection

#### Data Extractor (`src/services/data-extractor.js`)
**Purpose**: Extract and backup Salesforce data

**Flow**:
1. Connect to Salesforce org
2. Query specified objects
3. Handle pagination automatically
4. Save data with compression
5. Update metadata index

**Key Features**:
- Bulk extraction
- Incremental extraction
- Compression support
- Metadata tracking

#### CDC Handler (`src/services/cdc-handler.js`)
**Purpose**: Process Change Data Capture events

**Flow**:
1. Listen for CDC events
2. Buffer changes by object
3. Extract changed records periodically
4. Commit to version control

**Key Features**:
- Event buffering
- Periodic flushing
- Immediate extraction for critical changes
- Git integration

#### Data Versioning (`src/services/data-versioning.js`)
**Purpose**: Version control for data

**Flow**:
1. Create snapshots of data
2. Calculate content hashes
3. Store version metadata
4. Enable comparison and rollback

**Key Features**:
- Snapshot creation
- Version comparison
- Rollback capabilities
- Hash-based change detection
- Automatic pruning of old versions

### 3. Pipeline Orchestration

#### Orchestrator (`src/pipeline/orchestrator.js`)
**Purpose**: Coordinate workflows and automation

**Architecture**:
```
Orchestrator
├── Workflow Registry
│   ├── metadata-sync
│   ├── data-extract
│   ├── full-sync
│   └── deploy
├── Job Manager
│   ├── Active Jobs
│   ├── Job History
│   └── Job Status
└── Event Emitter
    ├── jobStarted
    ├── jobCompleted
    ├── jobFailed
    ├── stepCompleted
    └── stepFailed
```

**Workflow Execution**:
1. Trigger workflow by name
2. Create job with unique ID
3. Execute workflow steps sequentially
4. Track progress and emit events
5. Store result in job history

#### Deployment Manager (`src/pipeline/deploy.js`)
**Purpose**: Handle deployments to target orgs

**Features**:
- Validation (check-only deploys)
- Full deployment
- Quick deploy from validation
- Status monitoring
- Cancellation support

### 4. CI/CD Integration

#### GitHub Actions Workflows

**Metadata Sync** (`.github/workflows/metadata-sync.yml`)
- Trigger: Schedule, push, manual
- Actions: Retrieve, commit, push
- Frequency: Every 6 hours

**Validate and Deploy** (`.github/workflows/validate-deploy.yml`)
- Trigger: PR creation, merge to main
- Actions: Validate, test, deploy
- Environment: Production

**Data Backup** (`.github/workflows/data-backup.yml`)
- Trigger: Daily schedule, manual
- Actions: Extract, commit, artifact creation
- Retention: 30 days

**Test** (`.github/workflows/test.yml`)
- Trigger: Every push
- Actions: Lint, test, coverage
- Matrix: Node 18, 20

## Data Flow

### Metadata Sync Flow

```
SetupAuditTrail → Metadata Monitor → SFDX Retrieve → Git Commit → Push
                                           ↓
                                    Local Files
```

### Data Change Flow

```
Salesforce Data Change → CDC Event → Event Listener → CDC Handler
                                            ↓
                                     Buffer Changes
                                            ↓
                                    Data Extractor
                                            ↓
                                   Data Versioning
                                            ↓
                                      Git Commit
```

### Deployment Flow

```
Git Changes → GitHub Actions → Validate → Run Tests
                                   ↓
                              Deploy to Prod
                                   ↓
                                 Verify
```

## Configuration Management

### Hierarchical Configuration

1. **Default Config** (`config/default.json`)
   - Base configuration
   - Default values

2. **Environment Variables** (`.env`)
   - Credentials
   - Environment-specific settings

3. **Runtime Parameters**
   - Workflow context
   - Command-line arguments

### Configuration Categories

- **Pipeline**: Core behavior
- **Monitoring**: Polling intervals
- **Events**: CDC and Platform Events
- **Deployment**: Test levels, validation
- **Data Extraction**: Objects, format
- **Git**: Auto-commit, branching
- **Notifications**: Slack, email

## Error Handling

### Retry Strategy

- **Exponential Backoff**: Increasing delays between retries
- **Max Retries**: Configurable limit (default: 3)
- **Circuit Breaker**: Prevent cascade failures

### Logging

- **Winston**: Structured logging
- **Levels**: debug, info, warn, error
- **Transports**: Console, file
- **Format**: JSON with timestamps

### Recovery

- **Graceful Degradation**: Continue with partial functionality
- **State Persistence**: Resume from last known state
- **Manual Intervention**: Clear error messages and recovery steps

## Security Considerations

### Credential Management

- Environment variables for secrets
- No credentials in Git
- Encrypted storage in CI/CD

### Access Control

- Principle of least privilege
- Read-only where possible
- Audit trail for all operations

### Data Protection

- Optional data masking
- Encryption at rest
- Secure transmission (HTTPS)

## Performance Optimization

### Caching

- Metadata cache in memory
- Version index for quick lookups
- Connection pooling

### Batching

- Bulk API for large datasets
- Event buffering
- Commit batching

### Parallelization

- Concurrent object extraction
- Parallel workflow execution
- Non-blocking I/O

## Scalability

### Horizontal Scaling

- Stateless services
- Distributed event processing
- Load balancing

### Vertical Scaling

- Efficient memory usage
- Stream processing for large files
- Compression

## Monitoring and Observability

### Metrics

- Job execution times
- Success/failure rates
- API usage
- Data volumes

### Alerts

- Failed deployments
- Connection failures
- Quota warnings
- Error thresholds

### Dashboards

- Job history
- Pipeline status
- System health
- Performance metrics

## Extension Points

### Custom Workflows

Register custom workflows with the orchestrator:

```javascript
orchestrator.registerWorkflow('custom-workflow', async (context) => {
  // Custom logic
  return result;
});
```

### Event Handlers

Add custom event handlers:

```javascript
listener.on('dataChange', async (event) => {
  // Custom processing
});
```

### Data Transformations

Implement custom transformers:

```javascript
class CustomTransformer {
  transform(data) {
    // Transform logic
    return transformedData;
  }
}
```

## Future Enhancements

1. **Multi-Org Support**: Sync across multiple orgs
2. **Web Dashboard**: Real-time monitoring UI
3. **Advanced Analytics**: Trend analysis, predictions
4. **Smart Deployments**: AI-driven deployment strategies
5. **Integration Hub**: Connect with external systems
6. **Data Masking**: Advanced anonymization
7. **Conflict Resolution**: Automated merge strategies
8. **Performance Profiling**: Detailed metrics and optimization
