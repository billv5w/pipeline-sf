const MetadataMonitor = require('../../src/services/metadata-monitor');

// Mock dependencies
jest.mock('jsforce');
jest.mock('simple-git');

describe('MetadataMonitor', () => {
  let monitor;
  let mockConfig;

  beforeEach(() => {
    mockConfig = {
      git: {
        autoCommit: true,
        commitMessagePrefix: '[AUTO]'
      },
      monitoring: {
        metadataPollingInterval: 300000
      }
    };

    monitor = new MetadataMonitor(mockConfig);
  });

  describe('constructor', () => {
    it('should initialize with config', () => {
      expect(monitor.config).toBe(mockConfig);
      expect(monitor.conn).toBeNull();
    });
  });

  describe('buildCommitMessage', () => {
    it('should build correct commit message', () => {
      const changes = {
        modified: ['file1.js', 'file2.js'],
        created: ['file3.js'],
        deleted: [],
        total: 3
      };

      const message = monitor.buildCommitMessage(changes);

      expect(message).toContain('[AUTO]');
      expect(message).toContain('Modified: 2 files');
      expect(message).toContain('Created: 1 files');
    });

    it('should handle empty changes', () => {
      const changes = {
        modified: [],
        created: [],
        deleted: [],
        total: 0
      };

      const message = monitor.buildCommitMessage(changes);

      expect(message).toContain('[AUTO]');
    });
  });
});
