const winston = require('winston');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
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
    new winston.transports.File({ filename: 'logs/data-versioning.log' })
  ]
});

class DataVersioning {
  constructor(config) {
    this.config = config;
    this.git = simpleGit();
    this.dataDir = path.join(process.cwd(), 'data', 'versions');
    this.snapshotsDir = path.join(process.cwd(), 'data', 'snapshots');
  }

  async initialize() {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
      await fs.mkdir(this.snapshotsDir, { recursive: true });
      logger.info('Data versioning directories initialized');
    } catch (error) {
      logger.error('Error initializing data versioning', {
        error: error.message
      });
      throw error;
    }
  }

  async createSnapshot(objectName, data, metadata = {}) {
    try {
      const timestamp = new Date().toISOString();
      const hash = this.calculateHash(data);

      const snapshot = {
        objectName,
        timestamp,
        hash,
        recordCount: data.length,
        metadata,
        version: await this.getNextVersion(objectName)
      };

      // Save snapshot metadata
      const snapshotFile = path.join(
        this.snapshotsDir,
        `${objectName}_v${snapshot.version}_${timestamp.replace(/[:.]/g, '-')}.json`
      );

      await fs.writeFile(
        snapshotFile,
        JSON.stringify({ ...snapshot, data }, null, 2)
      );

      logger.info('Snapshot created', {
        objectName,
        version: snapshot.version,
        hash
      });

      // Update version index
      await this.updateVersionIndex(objectName, snapshot);

      return snapshot;
    } catch (error) {
      logger.error('Error creating snapshot', { error: error.message });
      throw error;
    }
  }

  async getNextVersion(objectName) {
    try {
      const indexFile = path.join(this.dataDir, `${objectName}_index.json`);

      try {
        const content = await fs.readFile(indexFile, 'utf-8');
        const index = JSON.parse(content);
        return index.versions.length + 1;
      } catch (error) {
        return 1;
      }
    } catch (error) {
      logger.error('Error getting next version', { error: error.message });
      return 1;
    }
  }

  async updateVersionIndex(objectName, snapshot) {
    try {
      const indexFile = path.join(this.dataDir, `${objectName}_index.json`);

      let index = {
        objectName,
        versions: [],
        latestVersion: 0
      };

      try {
        const content = await fs.readFile(indexFile, 'utf-8');
        index = JSON.parse(content);
      } catch (error) {
        // File doesn't exist yet
      }

      index.versions.push({
        version: snapshot.version,
        timestamp: snapshot.timestamp,
        hash: snapshot.hash,
        recordCount: snapshot.recordCount
      });

      index.latestVersion = snapshot.version;

      await fs.writeFile(indexFile, JSON.stringify(index, null, 2));

      logger.info('Version index updated', {
        objectName,
        version: snapshot.version
      });
    } catch (error) {
      logger.error('Error updating version index', { error: error.message });
    }
  }

  calculateHash(data) {
    const hash = crypto.createHash('sha256');
    hash.update(JSON.stringify(data));
    return hash.digest('hex');
  }

  async getVersion(objectName, version) {
    try {
      const files = await fs.readdir(this.snapshotsDir);
      const versionFile = files.find(
        f => f.startsWith(`${objectName}_v${version}_`)
      );

      if (!versionFile) {
        throw new Error(`Version ${version} not found for ${objectName}`);
      }

      const content = await fs.readFile(
        path.join(this.snapshotsDir, versionFile),
        'utf-8'
      );

      return JSON.parse(content);
    } catch (error) {
      logger.error('Error getting version', { error: error.message });
      throw error;
    }
  }

  async getLatestVersion(objectName) {
    try {
      const indexFile = path.join(this.dataDir, `${objectName}_index.json`);
      const content = await fs.readFile(indexFile, 'utf-8');
      const index = JSON.parse(content);

      return await this.getVersion(objectName, index.latestVersion);
    } catch (error) {
      logger.error('Error getting latest version', { error: error.message });
      throw error;
    }
  }

  async compareVersions(objectName, version1, version2) {
    try {
      const v1Data = await this.getVersion(objectName, version1);
      const v2Data = await this.getVersion(objectName, version2);

      const diff = {
        objectName,
        version1,
        version2,
        changes: {
          added: [],
          modified: [],
          deleted: []
        }
      };

      // Create maps for easier comparison
      const v1Map = new Map(v1Data.data.map(r => [r.Id, r]));
      const v2Map = new Map(v2Data.data.map(r => [r.Id, r]));

      // Find added and modified records
      for (const [id, record] of v2Map) {
        if (!v1Map.has(id)) {
          diff.changes.added.push(record);
        } else {
          const v1Record = v1Map.get(id);
          if (JSON.stringify(v1Record) !== JSON.stringify(record)) {
            diff.changes.modified.push({
              id,
              old: v1Record,
              new: record
            });
          }
        }
      }

      // Find deleted records
      for (const [id, record] of v1Map) {
        if (!v2Map.has(id)) {
          diff.changes.deleted.push(record);
        }
      }

      logger.info('Version comparison completed', {
        objectName,
        added: diff.changes.added.length,
        modified: diff.changes.modified.length,
        deleted: diff.changes.deleted.length
      });

      return diff;
    } catch (error) {
      logger.error('Error comparing versions', { error: error.message });
      throw error;
    }
  }

  async rollback(objectName, targetVersion) {
    try {
      logger.info(`Rolling back ${objectName} to version ${targetVersion}`);

      const snapshot = await this.getVersion(objectName, targetVersion);

      // This would typically involve:
      // 1. Extracting the data from the snapshot
      // 2. Transforming it for upsert
      // 3. Upserting to Salesforce
      // For now, we'll just log the action

      logger.info('Rollback prepared', {
        objectName,
        targetVersion,
        recordCount: snapshot.recordCount
      });

      return snapshot;
    } catch (error) {
      logger.error('Error rolling back', { error: error.message });
      throw error;
    }
  }

  async listVersions(objectName) {
    try {
      const indexFile = path.join(this.dataDir, `${objectName}_index.json`);
      const content = await fs.readFile(indexFile, 'utf-8');
      const index = JSON.parse(content);

      return index.versions;
    } catch (error) {
      logger.error('Error listing versions', { error: error.message });
      return [];
    }
  }

  async pruneOldVersions(objectName, keepCount = 10) {
    try {
      const versions = await this.listVersions(objectName);

      if (versions.length <= keepCount) {
        logger.info('No versions to prune', { objectName });
        return;
      }

      const toDelete = versions.slice(0, versions.length - keepCount);

      for (const version of toDelete) {
        const files = await fs.readdir(this.snapshotsDir);
        const versionFile = files.find(
          f => f.startsWith(`${objectName}_v${version.version}_`)
        );

        if (versionFile) {
          await fs.unlink(path.join(this.snapshotsDir, versionFile));
          logger.info('Deleted old version', {
            objectName,
            version: version.version
          });
        }
      }

      // Update index
      const indexFile = path.join(this.dataDir, `${objectName}_index.json`);
      const content = await fs.readFile(indexFile, 'utf-8');
      const index = JSON.parse(content);

      index.versions = versions.slice(-keepCount);

      await fs.writeFile(indexFile, JSON.stringify(index, null, 2));

      logger.info('Old versions pruned', {
        objectName,
        deleted: toDelete.length,
        kept: keepCount
      });
    } catch (error) {
      logger.error('Error pruning old versions', { error: error.message });
    }
  }
}

module.exports = DataVersioning;
