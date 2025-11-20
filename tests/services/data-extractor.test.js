const DataExtractor = require('../../src/services/data-extractor');
const path = require('path');

jest.mock('jsforce');
jest.mock('fs/promises');

describe('DataExtractor', () => {
  let extractor;
  let mockConfig;

  beforeEach(() => {
    mockConfig = {
      dataExtraction: {
        format: 'json',
        compression: true,
        objects: ['Account', 'Contact']
      }
    };

    extractor = new DataExtractor(mockConfig);
  });

  describe('constructor', () => {
    it('should initialize with config', () => {
      expect(extractor.config).toBe(mockConfig);
      expect(extractor.conn).toBeNull();
    });

    it('should set correct data directory', () => {
      const expectedPath = path.join(process.cwd(), 'data', 'extracts');
      expect(extractor.dataDir).toBe(expectedPath);
    });
  });

  describe('ensureDataDirectory', () => {
    it('should be defined', () => {
      expect(typeof extractor.ensureDataDirectory).toBe('function');
    });
  });

  describe('describeObject', () => {
    it('should be defined', () => {
      expect(typeof extractor.describeObject).toBe('function');
    });
  });

  describe('extractObjectData', () => {
    it('should be defined', () => {
      expect(typeof extractor.extractObjectData).toBe('function');
    });
  });
});
