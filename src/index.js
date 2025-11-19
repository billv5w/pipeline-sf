#!/usr/bin/env node

require('dotenv').config();
const PipelineOrchestrator = require('./pipeline/orchestrator');
const winston = require('winston');

// Configure logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    new winston.transports.File({ filename: 'logs/pipeline.log' })
  ]
});

async function main() {
  try {
    logger.info('Starting Salesforce Event-Driven Pipeline...');

    // Load configuration
    const config = require('../config/default.json');

    // Create orchestrator
    const orchestrator = new PipelineOrchestrator(config);

    // Set up event handlers
    orchestrator.on('started', () => {
      logger.info('Pipeline started successfully');
    });

    orchestrator.on('jobStarted', (job) => {
      logger.info(`Job started: ${job.workflow} [${job.id}]`);
    });

    orchestrator.on('jobCompleted', (job) => {
      logger.info(`Job completed: ${job.workflow} [${job.id}]`, {
        duration: job.endTime - job.startTime
      });
    });

    orchestrator.on('jobFailed', (job) => {
      logger.error(`Job failed: ${job.workflow} [${job.id}]`, {
        error: job.error
      });
    });

    orchestrator.on('stepCompleted', ({ step, result }) => {
      logger.info(`Step completed: ${step}`);
    });

    orchestrator.on('stepFailed', ({ step, error }) => {
      logger.error(`Step failed: ${step}`, { error });
    });

    // Start the orchestrator
    await orchestrator.start();

    // Graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('Received SIGINT, shutting down gracefully...');
      await orchestrator.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM, shutting down gracefully...');
      await orchestrator.stop();
      process.exit(0);
    });

    // Keep process alive
    logger.info('Pipeline is running. Press Ctrl+C to stop.');

  } catch (error) {
    logger.error('Fatal error in pipeline', { error: error.message });
    process.exit(1);
  }
}

// Handle command line arguments
const command = process.argv[2];

if (command === 'trigger') {
  // Trigger a specific workflow
  const workflowName = process.argv[3];
  const context = JSON.parse(process.argv[4] || '{}');

  require('dotenv').config();
  const config = require('../config/default.json');
  const orchestrator = new PipelineOrchestrator(config);

  orchestrator.initialize()
    .then(() => orchestrator.triggerWorkflow(workflowName, context))
    .then(result => {
      logger.info('Workflow triggered successfully', { result });
      process.exit(0);
    })
    .catch(error => {
      logger.error('Failed to trigger workflow', { error: error.message });
      process.exit(1);
    });
} else {
  // Start the pipeline
  main();
}
