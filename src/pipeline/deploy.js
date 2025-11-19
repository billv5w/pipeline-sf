const winston = require('winston');
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
    new winston.transports.File({ filename: 'logs/deploy.log' })
  ]
});

class DeploymentManager {
  constructor(config) {
    this.config = config;
    this.git = simpleGit();
  }

  async deploy(targetOrg, options = {}) {
    try {
      const {
        checkOnly = this.config.deployment?.checkOnly || false,
        testLevel = this.config.deployment?.testLevel || 'RunLocalTests',
        ignoreWarnings = this.config.deployment?.ignoreWarnings || false
      } = options;

      logger.info('Starting deployment', { targetOrg, checkOnly, testLevel });

      // Validate current branch
      const currentBranch = await this.getCurrentBranch();
      logger.info(`Deploying from branch: ${currentBranch}`);

      // Build deployment command
      let command = `sf project deploy start --target-org ${targetOrg}`;

      if (checkOnly) {
        command += ' --dry-run';
      }

      if (testLevel) {
        command += ` --test-level ${testLevel}`;
      }

      if (ignoreWarnings) {
        command += ' --ignore-warnings';
      }

      // Execute deployment
      logger.info(`Executing: ${command}`);

      const output = execSync(command, {
        cwd: process.cwd(),
        encoding: 'utf-8',
        stdio: 'pipe'
      });

      logger.info('Deployment completed successfully', { output });

      return {
        success: true,
        targetOrg,
        checkOnly,
        output,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Deployment failed', {
        error: error.message,
        stderr: error.stderr?.toString()
      });

      throw new Error(`Deployment failed: ${error.message}`);
    }
  }

  async validate(targetOrg) {
    logger.info('Validating deployment (check-only mode)');
    return await this.deploy(targetOrg, { checkOnly: true });
  }

  async quickDeploy(validationId, targetOrg) {
    try {
      logger.info('Starting quick deploy', { validationId, targetOrg });

      const command = `sf project deploy quick --job-id ${validationId} --target-org ${targetOrg}`;

      const output = execSync(command, {
        cwd: process.cwd(),
        encoding: 'utf-8'
      });

      logger.info('Quick deploy completed', { output });

      return {
        success: true,
        validationId,
        targetOrg,
        output
      };
    } catch (error) {
      logger.error('Quick deploy failed', { error: error.message });
      throw error;
    }
  }

  async getCurrentBranch() {
    try {
      const status = await this.git.status();
      return status.current;
    } catch (error) {
      logger.error('Error getting current branch', { error: error.message });
      throw error;
    }
  }

  async getDeploymentStatus(jobId, targetOrg) {
    try {
      const command = `sf project deploy report --job-id ${jobId} --target-org ${targetOrg}`;

      const output = execSync(command, {
        cwd: process.cwd(),
        encoding: 'utf-8'
      });

      return output;
    } catch (error) {
      logger.error('Error getting deployment status', { error: error.message });
      throw error;
    }
  }

  async cancel(jobId, targetOrg) {
    try {
      logger.info('Cancelling deployment', { jobId, targetOrg });

      const command = `sf project deploy cancel --job-id ${jobId} --target-org ${targetOrg}`;

      const output = execSync(command, {
        cwd: process.cwd(),
        encoding: 'utf-8'
      });

      logger.info('Deployment cancelled', { output });

      return {
        success: true,
        jobId,
        output
      };
    } catch (error) {
      logger.error('Error cancelling deployment', { error: error.message });
      throw error;
    }
  }
}

module.exports = DeploymentManager;

// Run if called directly
if (require.main === module) {
  require('dotenv').config();
  const config = require('../../config/default.json');

  const targetOrg = process.argv[2];
  const checkOnly = process.argv[3] === '--check-only';

  if (!targetOrg) {
    console.error('Usage: node deploy.js <target-org> [--check-only]');
    process.exit(1);
  }

  const deployer = new DeploymentManager(config);

  deployer.deploy(targetOrg, { checkOnly })
    .then(result => {
      logger.info('Deployment completed', result);
      process.exit(0);
    })
    .catch(error => {
      logger.error('Deployment failed', { error: error.message });
      process.exit(1);
    });
}
