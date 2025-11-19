const SalesforceEventListener = require('./event-listener');
const DataExtractor = require('./data-extractor');
const winston = require('winston');
const simpleGit = require('simple-git');

// Configure logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    }),
    new winston.transports.File({ filename: 'logs/cdc-handler.log' })
  ]
});

class CDCHandler {
  constructor(config) {
    this.config = config;
    this.eventListener = new SalesforceEventListener(config);
    this.dataExtractor = new DataExtractor(config);
    this.git = simpleGit();
    this.changeBuffer = new Map(); // Buffer changes by object
    this.flushInterval = 60000; // Flush every 60 seconds
  }

  async start() {
    try {
      logger.info('Starting CDC Handler...');

      // Set up event listeners
      this.eventListener.on('dataChange', async (event) => {
        await this.handleDataChange(event);
      });

      this.eventListener.on('platformEvent', async (event) => {
        await this.handlePlatformEvent(event);
      });

      // Start listening
      await this.eventListener.start();

      // Start periodic flush
      this.startPeriodicFlush();

      logger.info('CDC Handler started successfully');
    } catch (error) {
      logger.error('Error starting CDC Handler', { error: error.message });
      throw error;
    }
  }

  async handleDataChange(event) {
    try {
      logger.info('Processing data change event', {
        object: event.object,
        changeType: event.changeType,
        recordCount: event.recordIds?.length || 0
      });

      // Buffer the change
      if (!this.changeBuffer.has(event.object)) {
        this.changeBuffer.set(event.object, []);
      }

      this.changeBuffer.get(event.object).push(event);

      // Log the change
      await this.logChange(event);

      // Optionally extract data immediately for critical changes
      if (this.shouldExtractImmediately(event)) {
        await this.extractAndCommit(event.object);
      }
    } catch (error) {
      logger.error('Error handling data change', { error: error.message });
    }
  }

  async handlePlatformEvent(event) {
    try {
      logger.info('Processing platform event', {
        channel: event.channel,
        data: event.data
      });

      // Custom logic based on platform event
      // This could trigger metadata retrieval, deployments, etc.
      if (event.data?.TriggerMetadataSync__c) {
        logger.info('Metadata sync requested via platform event');
        // Trigger metadata sync
      }

      if (event.data?.TriggerDataExtraction__c) {
        logger.info('Data extraction requested via platform event');
        // Trigger data extraction
      }
    } catch (error) {
      logger.error('Error handling platform event', { error: error.message });
    }
  }

  shouldExtractImmediately(event) {
    // Extract immediately for deletions or specific change types
    return event.changeType === 'DELETE' ||
           event.changeType === 'UNDELETE';
  }

  async extractAndCommit(objectName) {
    try {
      const changes = this.changeBuffer.get(objectName) || [];

      if (changes.length === 0) {
        return;
      }

      logger.info(`Extracting and committing changes for ${objectName}`, {
        changeCount: changes.length
      });

      // Extract the changed records
      const result = await this.dataExtractor.extractChangedRecords(
        objectName,
        changes
      );

      if (result && this.config.git?.autoCommit) {
        // Commit to git
        await this.git.add('data/extracts/*');

        const commitMessage = this.buildCommitMessage(objectName, changes);
        await this.git.commit(commitMessage);

        logger.info('Changes committed to git', {
          objectName,
          changeCount: changes.length
        });
      }

      // Clear buffer for this object
      this.changeBuffer.delete(objectName);

    } catch (error) {
      logger.error('Error in extractAndCommit', { error: error.message });
    }
  }

  buildCommitMessage(objectName, changes) {
    const prefix = this.config.git?.commitMessagePrefix || '[AUTO]';
    const timestamp = new Date().toISOString();

    const changeCounts = changes.reduce((acc, change) => {
      acc[change.changeType] = (acc[change.changeType] || 0) + 1;
      return acc;
    }, {});

    let message = `${prefix} Data changes for ${objectName} at ${timestamp}\n\n`;

    for (const [changeType, count] of Object.entries(changeCounts)) {
      message += `${changeType}: ${count} record(s)\n`;
    }

    return message;
  }

  async logChange(event) {
    try {
      const logEntry = {
        timestamp: event.timestamp,
        object: event.object,
        changeType: event.changeType,
        recordIds: event.recordIds,
        data: event.data
      };

      // Could save to a change log file or database
      logger.info('Change logged', logEntry);
    } catch (error) {
      logger.error('Error logging change', { error: error.message });
    }
  }

  startPeriodicFlush() {
    setInterval(async () => {
      try {
        logger.info('Periodic flush triggered', {
          bufferedObjects: this.changeBuffer.size
        });

        for (const objectName of this.changeBuffer.keys()) {
          await this.extractAndCommit(objectName);
        }
      } catch (error) {
        logger.error('Error in periodic flush', { error: error.message });
      }
    }, this.flushInterval);
  }

  async stop() {
    logger.info('Stopping CDC Handler...');
    await this.eventListener.unsubscribeAll();
  }
}

module.exports = CDCHandler;

// Run if called directly
if (require.main === module) {
  require('dotenv').config();
  const config = require('../../config/default.json');

  const handler = new CDCHandler(config);

  handler.start().catch(error => {
    logger.error('Failed to start CDC Handler', { error: error.message });
    process.exit(1);
  });

  // Graceful shutdown
  process.on('SIGINT', async () => {
    logger.info('Shutting down CDC Handler...');
    await handler.stop();
    process.exit(0);
  });
}
