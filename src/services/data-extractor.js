const jsforce = require('jsforce');
const winston = require('winston');
const fs = require('fs').promises;
const path = require('path');
const zlib = require('zlib');
const { promisify } = require('util');

const gzip = promisify(zlib.gzip);

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
    new winston.transports.File({ filename: 'logs/data-extractor.log' })
  ]
});

class DataExtractor {
  constructor(config) {
    this.config = config;
    this.conn = null;
    this.dataDir = path.join(process.cwd(), 'data', 'extracts');
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

      logger.info('Connected to Salesforce for data extraction');
      return true;
    } catch (error) {
      logger.error('Failed to connect to Salesforce', { error: error.message });
      throw error;
    }
  }

  async ensureDataDirectory() {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
    } catch (error) {
      logger.error('Error creating data directory', { error: error.message });
    }
  }

  async describeObject(objectName) {
    try {
      const description = await this.conn.sobject(objectName).describe();
      return description;
    } catch (error) {
      logger.error(`Error describing object ${objectName}`, {
        error: error.message
      });
      throw error;
    }
  }

  async extractObjectData(objectName, filter = '') {
    try {
      logger.info(`Extracting data from ${objectName}...`);

      // Get object description
      const description = await this.describeObject(objectName);

      // Build field list (exclude compound fields and non-queryable)
      const fields = description.fields
        .filter(f => f.type !== 'address' && f.type !== 'location')
        .map(f => f.name)
        .join(', ');

      // Build query
      let query = `SELECT ${fields} FROM ${objectName}`;
      if (filter) {
        query += ` WHERE ${filter}`;
      }

      logger.info(`Query: ${query.substring(0, 100)}...`);

      // Execute query with automatic batching
      const records = [];
      const queryResult = await this.conn.query(query);

      records.push(...queryResult.records);

      // Handle pagination
      let nextRecordsUrl = queryResult.nextRecordsUrl;
      while (nextRecordsUrl) {
        const moreRecords = await this.conn.queryMore(nextRecordsUrl);
        records.push(...moreRecords.records);
        nextRecordsUrl = moreRecords.nextRecordsUrl;
      }

      logger.info(`Extracted ${records.length} records from ${objectName}`);

      return {
        objectName,
        recordCount: records.length,
        records,
        extractedAt: new Date().toISOString(),
        fields: description.fields.map(f => ({
          name: f.name,
          type: f.type,
          label: f.label
        }))
      };
    } catch (error) {
      logger.error(`Error extracting data from ${objectName}`, {
        error: error.message
      });
      throw error;
    }
  }

  async saveExtract(extractData, compress = true) {
    try {
      await this.ensureDataDirectory();

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${extractData.objectName}_${timestamp}.json`;
      const filepath = path.join(this.dataDir, filename);

      const jsonData = JSON.stringify(extractData, null, 2);

      if (compress) {
        const compressed = await gzip(jsonData);
        await fs.writeFile(filepath + '.gz', compressed);
        logger.info(`Saved compressed extract to ${filepath}.gz`);
      } else {
        await fs.writeFile(filepath, jsonData);
        logger.info(`Saved extract to ${filepath}`);
      }

      // Also save a lightweight version with just metadata
      const metadata = {
        objectName: extractData.objectName,
        recordCount: extractData.recordCount,
        extractedAt: extractData.extractedAt,
        fields: extractData.fields,
        filepath: compress ? filepath + '.gz' : filepath
      };

      const metadataFile = path.join(this.dataDir, 'metadata.json');
      let metadataList = [];

      try {
        const existing = await fs.readFile(metadataFile, 'utf-8');
        metadataList = JSON.parse(existing);
      } catch (error) {
        // File doesn't exist yet
      }

      metadataList.push(metadata);
      await fs.writeFile(metadataFile, JSON.stringify(metadataList, null, 2));

      return filepath;
    } catch (error) {
      logger.error('Error saving extract', { error: error.message });
      throw error;
    }
  }

  async extractAll(objects = null) {
    try {
      await this.connect();

      const objectsToExtract = objects || this.config.dataExtraction?.objects || [];

      logger.info(`Starting extraction for ${objectsToExtract.length} objects`);

      const results = [];

      for (const objectName of objectsToExtract) {
        try {
          const extractData = await this.extractObjectData(objectName);
          const filepath = await this.saveExtract(
            extractData,
            this.config.dataExtraction?.compression
          );

          results.push({
            objectName,
            success: true,
            recordCount: extractData.recordCount,
            filepath
          });
        } catch (error) {
          logger.error(`Failed to extract ${objectName}`, {
            error: error.message
          });
          results.push({
            objectName,
            success: false,
            error: error.message
          });
        }
      }

      logger.info('Extraction completed', {
        total: results.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length
      });

      return results;
    } catch (error) {
      logger.error('Error in extraction process', { error: error.message });
      throw error;
    }
  }

  async extractChangedRecords(objectName, changeEvents) {
    try {
      logger.info(`Extracting changed records for ${objectName}`);

      const recordIds = changeEvents
        .flatMap(e => e.recordIds || [])
        .filter((id, index, self) => self.indexOf(id) === index); // unique

      if (recordIds.length === 0) {
        logger.info('No record IDs to extract');
        return null;
      }

      // Build filter for specific IDs
      const filter = `Id IN ('${recordIds.join("','")}')`;

      const extractData = await this.extractObjectData(objectName, filter);
      const filepath = await this.saveExtract(extractData, true);

      return {
        objectName,
        recordCount: extractData.recordCount,
        filepath,
        changeEvents
      };
    } catch (error) {
      logger.error('Error extracting changed records', {
        error: error.message
      });
      throw error;
    }
  }
}

module.exports = DataExtractor;

// Run if called directly
if (require.main === module) {
  require('dotenv').config();
  const config = require('../../config/default.json');

  const extractor = new DataExtractor(config);
  extractor.extractAll()
    .then(results => {
      logger.info('Extraction process completed', results);
      process.exit(0);
    })
    .catch(error => {
      logger.error('Extraction process failed', { error: error.message });
      process.exit(1);
    });
}
