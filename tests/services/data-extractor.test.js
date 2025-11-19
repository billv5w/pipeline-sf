const DataExtractor = require('../../src/services/data-extractor');

jest.mock('jsforce');
jest.mock('fs').promises;

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
  });

  describe('calculateHash', () => {
    // Mock crypto for testing
    it('should calculate hash for data', () => {
      const data = [{ Id: '001', Name: 'Test' }];
      const hash1 = extractor.calculateHash(data);
      const hash2 = extractor.calculateHash(data);

      expect(hash1).toBe(hash2);
      expect(typeof hash1).toBe('string');
    });

    it('should generate different hashes for different data', () => {
      const data1 = [{ Id: '001', Name: 'Test1' }];
      const data2 = [{ Id: '002', Name: 'Test2' }];

      const hash1 = extractor.calculateHash(data1);
      const hash2 = extractor.calculateHash(data2);

      expect(hash1).not.toBe(hash2);
    });
  });
});
