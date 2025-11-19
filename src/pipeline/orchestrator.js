const winston = require('winston');
const EventEmitter = require('events');
const MetadataMonitor = require('../services/metadata-monitor');
const CDCHandler = require('../services/cdc-handler');
const DataExtractor = require('../services/data-extractor');

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
    new winston.transports.File({ filename: 'logs/orchestrator.log' })
  ]
});

class PipelineOrchestrator extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.workflows = new Map();
    this.activeJobs = new Map();
    this.jobHistory = [];

    // Initialize services
    this.metadataMonitor = null;
    this.cdcHandler = null;
    this.dataExtractor = new DataExtractor(config);
  }

  async initialize() {
    try {
      logger.info('Initializing Pipeline Orchestrator...');

      // Initialize metadata monitoring if enabled
      if (this.config.pipeline?.enableMetadataTracking) {
        this.metadataMonitor = new MetadataMonitor(this.config);
        logger.info('Metadata monitoring initialized');
      }

      // Initialize CDC handler if enabled
      if (this.config.pipeline?.enableDataTracking) {
        this.cdcHandler = new CDCHandler(this.config);
        logger.info('CDC handler initialized');
      }

      // Register default workflows
      this.registerDefaultWorkflows();

      logger.info('Pipeline Orchestrator initialized successfully');
    } catch (error) {
      logger.error('Error initializing orchestrator', { error: error.message });
      throw error;
    }
  }

  registerDefaultWorkflows() {
    // Metadata change workflow
    this.registerWorkflow('metadata-sync', async (context) => {
      logger.info('Executing metadata-sync workflow');

      const steps = [
        { name: 'retrieve', action: () => this.metadataMonitor.retrieveMetadata() },
        { name: 'detect', action: () => this.metadataMonitor.detectChanges() },
        { name: 'commit', action: (changes) => this.metadataMonitor.commitChanges(changes) }
      ];

      return await this.executeSteps(steps, context);
    });

    // Data extraction workflow
    this.registerWorkflow('data-extract', async (context) => {
      logger.info('Executing data-extract workflow');

      const objects = context.objects || this.config.dataExtraction?.objects;

      const steps = [
        { name: 'extract', action: () => this.dataExtractor.extractAll(objects) }
      ];

      return await this.executeSteps(steps, context);
    });

    // Full sync workflow (metadata + data)
    this.registerWorkflow('full-sync', async (context) => {
      logger.info('Executing full-sync workflow');

      const metadataResult = await this.triggerWorkflow('metadata-sync', context);
      const dataResult = await this.triggerWorkflow('data-extract', context);

      return {
        metadata: metadataResult,
        data: dataResult
      };
    });

    // Deployment workflow
    this.registerWorkflow('deploy', async (context) => {
      logger.info('Executing deploy workflow');

      const { targetOrg, checkOnly = false } = context;

      const steps = [
        { name: 'validate', action: () => this.validateDeployment(targetOrg) },
        { name: 'deploy', action: () => this.deployMetadata(targetOrg, checkOnly) },
        { name: 'verify', action: () => this.verifyDeployment(targetOrg) }
      ];

      return await this.executeSteps(steps, context);
    });

    logger.info('Default workflows registered');
  }

  registerWorkflow(name, handler) {
    this.workflows.set(name, handler);
    logger.info(`Workflow registered: ${name}`);
  }

  async triggerWorkflow(workflowName, context = {}) {
    try {
      const jobId = this.generateJobId();
      const workflow = this.workflows.get(workflowName);

      if (!workflow) {
        throw new Error(`Workflow not found: ${workflowName}`);
      }

      logger.info(`Triggering workflow: ${workflowName}`, { jobId });

      const job = {
        id: jobId,
        workflow: workflowName,
        status: 'running',
        startTime: new Date(),
        context
      };

      this.activeJobs.set(jobId, job);
      this.emit('jobStarted', job);

      try {
        const result = await workflow(context);

        job.status = 'completed';
        job.endTime = new Date();
        job.result = result;

        this.emit('jobCompleted', job);
        logger.info(`Workflow completed: ${workflowName}`, { jobId });

        return result;
      } catch (error) {
        job.status = 'failed';
        job.endTime = new Date();
        job.error = error.message;

        this.emit('jobFailed', job);
        logger.error(`Workflow failed: ${workflowName}`, {
          jobId,
          error: error.message
        });

        throw error;
      } finally {
        this.activeJobs.delete(jobId);
        this.jobHistory.push(job);

        // Keep only last 100 jobs in history
        if (this.jobHistory.length > 100) {
          this.jobHistory.shift();
        }
      }
    } catch (error) {
      logger.error('Error triggering workflow', { error: error.message });
      throw error;
    }
  }

  async executeSteps(steps, context) {
    const results = [];
    let previousResult = null;

    for (const step of steps) {
      try {
        logger.info(`Executing step: ${step.name}`);

        const result = await step.action(previousResult, context);
        results.push({ step: step.name, success: true, result });
        previousResult = result;

        this.emit('stepCompleted', { step: step.name, result });
      } catch (error) {
        logger.error(`Step failed: ${step.name}`, { error: error.message });
        results.push({ step: step.name, success: false, error: error.message });

        this.emit('stepFailed', { step: step.name, error: error.message });

        // Stop execution on failure
        throw error;
      }
    }

    return results;
  }

  async validateDeployment(targetOrg) {
    logger.info(`Validating deployment to ${targetOrg}`);
    // Implement validation logic
    return { valid: true };
  }

  async deployMetadata(targetOrg, checkOnly) {
    logger.info(`Deploying metadata to ${targetOrg}`, { checkOnly });

    const { execSync } = require('child_process');

    try {
      const command = `sf project deploy start --target-org ${targetOrg} ${checkOnly ? '--dry-run' : ''}`;
      const output = execSync(command, { cwd: process.cwd(), encoding: 'utf-8' });

      logger.info('Deployment completed', { output });
      return { success: true, output };
    } catch (error) {
      logger.error('Deployment failed', { error: error.message });
      throw error;
    }
  }

  async verifyDeployment(targetOrg) {
    logger.info(`Verifying deployment to ${targetOrg}`);
    // Implement verification logic
    return { verified: true };
  }

  async start() {
    try {
      await this.initialize();

      // Start metadata monitoring
      if (this.metadataMonitor) {
        await this.metadataMonitor.startPolling(
          this.config.monitoring?.metadataPollingInterval || 300000
        );
      }

      // Start CDC handler
      if (this.cdcHandler) {
        await this.cdcHandler.start();
      }

      logger.info('Pipeline Orchestrator started successfully');

      this.emit('started');
    } catch (error) {
      logger.error('Error starting orchestrator', { error: error.message });
      throw error;
    }
  }

  async stop() {
    logger.info('Stopping Pipeline Orchestrator...');

    if (this.cdcHandler) {
      await this.cdcHandler.stop();
    }

    this.emit('stopped');
    logger.info('Pipeline Orchestrator stopped');
  }

  generateJobId() {
    return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  getJobStatus(jobId) {
    return this.activeJobs.get(jobId) ||
           this.jobHistory.find(j => j.id === jobId);
  }

  getActiveJobs() {
    return Array.from(this.activeJobs.values());
  }

  getJobHistory(limit = 20) {
    return this.jobHistory.slice(-limit);
  }
}

module.exports = PipelineOrchestrator;
