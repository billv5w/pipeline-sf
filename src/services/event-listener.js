const jsforce = require('jsforce');
const winston = require('winston');
const EventEmitter = require('events');

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
    new winston.transports.File({ filename: 'logs/event-listener.log' })
  ]
});

class SalesforceEventListener extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.conn = null;
    this.subscriptions = new Map();
  }

  async connect() {
    try {
      this.conn = new jsforce.Connection({
        loginUrl: process.env.SF_LOGIN_URL || 'https://login.salesforce.com',
        version: process.env.SF_API_VERSION || '59.0'
      });

      if (process.env.SF_REFRESH_TOKEN) {
        await this.conn.oauth2.refreshToken(process.env.SF_REFRESH_TOKEN);
      } else {
        await this.conn.login(
          process.env.SF_USERNAME,
          process.env.SF_PASSWORD + (process.env.SF_SECURITY_TOKEN || '')
        );
      }

      logger.info('Connected to Salesforce org for event listening', {
        orgId: this.conn.userInfo.organizationId,
        username: this.conn.userInfo.userName
      });

      return true;
    } catch (error) {
      logger.error('Failed to connect to Salesforce', { error: error.message });
      throw error;
    }
  }

  async subscribeToPlatformEvents(channel) {
    try {
      logger.info(`Subscribing to Platform Event: ${channel}`);

      const subscription = this.conn.streaming.topic(channel).subscribe((message) => {
        logger.info('Received Platform Event', {
          channel,
          replayId: message.event.replayId,
          data: message.payload
        });

        this.emit('platformEvent', {
          type: 'platformEvent',
          channel,
          data: message.payload,
          timestamp: new Date()
        });
      });

      this.subscriptions.set(channel, subscription);
      logger.info(`Successfully subscribed to ${channel}`);

      return subscription;
    } catch (error) {
      logger.error(`Error subscribing to platform events: ${channel}`, {
        error: error.message
      });
      throw error;
    }
  }

  async subscribeToChangeDataCapture(objectName) {
    try {
      const channel = `/data/${objectName}ChangeEvent`;
      logger.info(`Subscribing to Change Data Capture: ${channel}`);

      const subscription = this.conn.streaming.topic(channel).subscribe((message) => {
        logger.info('Received CDC Event', {
          object: objectName,
          changeType: message.payload?.ChangeEventHeader?.changeType,
          recordIds: message.payload?.ChangeEventHeader?.recordIds,
          data: message.payload
        });

        this.emit('dataChange', {
          type: 'changeDataCapture',
          object: objectName,
          changeType: message.payload?.ChangeEventHeader?.changeType,
          recordIds: message.payload?.ChangeEventHeader?.recordIds,
          data: message.payload,
          timestamp: new Date()
        });
      });

      this.subscriptions.set(channel, subscription);
      logger.info(`Successfully subscribed to ${channel}`);

      return subscription;
    } catch (error) {
      logger.error(`Error subscribing to CDC: ${objectName}`, {
        error: error.message
      });
      throw error;
    }
  }

  async subscribeToAll() {
    try {
      await this.connect();

      // Subscribe to Platform Events
      if (this.config.events?.platformEvents?.enabled) {
        const channel = this.config.events.platformEvents.channel;
        await this.subscribeToPlatformEvents(channel);
      }

      // Subscribe to Change Data Capture
      if (this.config.events?.changeDataCapture?.enabled) {
        const objects = this.config.events.changeDataCapture.objects || [];
        for (const obj of objects) {
          await this.subscribeToChangeDataCapture(obj);
        }
      }

      logger.info('All event subscriptions established');
    } catch (error) {
      logger.error('Error setting up event subscriptions', {
        error: error.message
      });
      throw error;
    }
  }

  async unsubscribeAll() {
    try {
      for (const [channel, subscription] of this.subscriptions) {
        await subscription.cancel();
        logger.info(`Unsubscribed from ${channel}`);
      }
      this.subscriptions.clear();
    } catch (error) {
      logger.error('Error unsubscribing from events', {
        error: error.message
      });
    }
  }

  async start() {
    try {
      await this.subscribeToAll();

      logger.info('Event listener started successfully');

      // Keep process alive
      process.on('SIGINT', async () => {
        logger.info('Shutting down event listener...');
        await this.unsubscribeAll();
        process.exit(0);
      });

    } catch (error) {
      logger.error('Error starting event listener', {
        error: error.message
      });
      throw error;
    }
  }
}

module.exports = SalesforceEventListener;

// Run if called directly
if (require.main === module) {
  require('dotenv').config();
  const config = require('../../config/default.json');

  const listener = new SalesforceEventListener(config);

  // Set up event handlers
  listener.on('platformEvent', (event) => {
    logger.info('Platform Event Handler triggered', event);
    // Trigger pipeline actions here
  });

  listener.on('dataChange', (event) => {
    logger.info('Data Change Handler triggered', event);
    // Trigger data pipeline actions here
  });

  listener.start();
}
