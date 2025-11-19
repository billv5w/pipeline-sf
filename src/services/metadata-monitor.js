const jsforce = require('jsforce');
const winston = require('winston');
const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');
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
    new winston.transports.File({ filename: 'logs/metadata-monitor.log' })
  ]
});

class MetadataMonitor {
  constructor(config) {
    this.config = config;
    this.conn = null;
    this.git = simpleGit();
    this.lastCheck = new Date();
    this.metadataCache = new Map();
  }

  async connect() {
    try {
      this.conn = new jsforce.Connection({
        loginUrl: process.env.SF_LOGIN_URL || 'https://login.salesforce.com',
        version: process.env.SF_API_VERSION || '59.0'
      });

      if (process.env.SF_REFRESH_TOKEN) {
        // OAuth flow
        await this.conn.oauth2.refreshToken(process.env.SF_REFRESH_TOKEN);
      } else {
        // Username/password flow
        await this.conn.login(
          process.env.SF_USERNAME,
          process.env.SF_PASSWORD + (process.env.SF_SECURITY_TOKEN || '')
        );
      }

      logger.info('Connected to Salesforce org', {
        orgId: this.conn.userInfo.organizationId,
        username: this.conn.userInfo.userName
      });

      return true;
    } catch (error) {
      logger.error('Failed to connect to Salesforce', { error: error.message });
      throw error;
    }
  }

  async getMetadataChanges() {
    try {
      const query = `
        SELECT Id, CreatedDate, CreatedById, CreatedBy.Name,
               SetupEntityId, Section, Action
        FROM SetupAuditTrail
        WHERE CreatedDate > ${this.lastCheck.toISOString()}
        ORDER BY CreatedDate DESC
      `;

      const result = await this.conn.query(query);
      logger.info(`Found ${result.totalSize} setup changes since last check`);

      return result.records;
    } catch (error) {
      logger.error('Error querying SetupAuditTrail', { error: error.message });
      return [];
    }
  }

  async retrieveMetadata() {
    try {
      logger.info('Retrieving metadata from org...');

      // Use SFDX to retrieve metadata
      const retrieveCommand = `sf project retrieve start --target-org ${process.env.SF_USERNAME} --manifest manifest/package.xml`;

      try {
        execSync(retrieveCommand, {
          cwd: process.cwd(),
          stdio: 'inherit'
        });
        logger.info('Metadata retrieved successfully');
        return true;
      } catch (error) {
        // If manifest doesn't exist, retrieve all metadata
        logger.warn('Package.xml not found, retrieving all metadata...');
        execSync(`sf project retrieve start --target-org ${process.env.SF_USERNAME}`, {
          cwd: process.cwd(),
          stdio: 'inherit'
        });
        return true;
      }
    } catch (error) {
      logger.error('Error retrieving metadata', { error: error.message });
      return false;
    }
  }

  async detectChanges() {
    try {
      const status = await this.git.status();

      const changes = {
        modified: status.modified,
        created: status.not_added,
        deleted: status.deleted,
        total: status.modified.length + status.not_added.length + status.deleted.length
      };

      logger.info('Detected local changes', changes);
      return changes;
    } catch (error) {
      logger.error('Error detecting changes', { error: error.message });
      return null;
    }
  }

  async commitChanges(changes) {
    try {
      if (changes.total === 0) {
        logger.info('No changes to commit');
        return false;
      }

      await this.git.add('./*');

      const commitMessage = this.buildCommitMessage(changes);
      await this.git.commit(commitMessage);

      logger.info('Changes committed successfully', { message: commitMessage });
      return true;
    } catch (error) {
      logger.error('Error committing changes', { error: error.message });
      return false;
    }
  }

  buildCommitMessage(changes) {
    const prefix = this.config.git?.commitMessagePrefix || '[AUTO]';
    const timestamp = new Date().toISOString();

    let message = `${prefix} Metadata sync at ${timestamp}\n\n`;

    if (changes.modified.length > 0) {
      message += `Modified: ${changes.modified.length} files\n`;
    }
    if (changes.created.length > 0) {
      message += `Created: ${changes.created.length} files\n`;
    }
    if (changes.deleted.length > 0) {
      message += `Deleted: ${changes.deleted.length} files\n`;
    }

    return message;
  }

  async monitor() {
    try {
      logger.info('Starting metadata monitoring...');

      await this.connect();

      // Check for setup changes
      const setupChanges = await this.getMetadataChanges();

      if (setupChanges.length > 0) {
        logger.info('Detected metadata changes in org, retrieving...');

        // Retrieve metadata
        await this.retrieveMetadata();

        // Detect local changes
        const localChanges = await this.detectChanges();

        // Commit if configured
        if (this.config.git?.autoCommit && localChanges) {
          await this.commitChanges(localChanges);
        }
      }

      this.lastCheck = new Date();
      logger.info('Monitoring cycle completed');

      return setupChanges;
    } catch (error) {
      logger.error('Error in monitoring cycle', { error: error.message });
      throw error;
    }
  }

  async startPolling(interval = 300000) {
    logger.info(`Starting metadata polling every ${interval}ms`);

    // Run immediately
    await this.monitor();

    // Then poll at interval
    setInterval(async () => {
      try {
        await this.monitor();
      } catch (error) {
        logger.error('Error in polling cycle', { error: error.message });
      }
    }, interval);
  }
}

module.exports = MetadataMonitor;

// Run if called directly
if (require.main === module) {
  require('dotenv').config();
  const config = require('../../config/default.json');

  const monitor = new MetadataMonitor(config);
  monitor.startPolling(config.monitoring.metadataPollingInterval);
}
