const DataVersioning = require('../../src/services/data-versioning');

jest.mock('fs').promises;
jest.mock('simple-git');

describe('DataVersioning', () => {
  let versioning;
  let mockConfig;

  beforeEach(() => {
    mockConfig = {
      git: {
        autoCommit: true
      }
    };

    versioning = new DataVersioning(mockConfig);
  });

  describe('constructor', () => {
    it('should initialize with config', () => {
      expect(versioning.config).toBe(mockConfig);
    });
  });

  describe('calculateHash', () => {
    it('should calculate consistent hash', () => {
      const data = [{ Id: '001', Name: 'Test' }];
      const hash1 = versioning.calculateHash(data);
      const hash2 = versioning.calculateHash(data);

      expect(hash1).toBe(hash2);
      expect(typeof hash1).toBe('string');
      expect(hash1.length).toBe(64); // SHA-256 produces 64 character hex string
    });
  });
});
