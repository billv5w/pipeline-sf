const PipelineOrchestrator = require('../../src/pipeline/orchestrator');

jest.mock('../../src/services/metadata-monitor');
jest.mock('../../src/services/cdc-handler');
jest.mock('../../src/services/data-extractor');

describe('PipelineOrchestrator', () => {
  let orchestrator;
  let mockConfig;

  beforeEach(() => {
    mockConfig = {
      pipeline: {
        enableMetadataTracking: true,
        enableDataTracking: true
      }
    };

    orchestrator = new PipelineOrchestrator(mockConfig);
  });

  describe('constructor', () => {
    it('should initialize with config', () => {
      expect(orchestrator.config).toBe(mockConfig);
      expect(orchestrator.workflows).toBeInstanceOf(Map);
      expect(orchestrator.activeJobs).toBeInstanceOf(Map);
    });
  });

  describe('registerWorkflow', () => {
    it('should register a workflow', () => {
      const handler = jest.fn();
      orchestrator.registerWorkflow('test-workflow', handler);

      expect(orchestrator.workflows.has('test-workflow')).toBe(true);
      expect(orchestrator.workflows.get('test-workflow')).toBe(handler);
    });
  });

  describe('generateJobId', () => {
    it('should generate unique job IDs', () => {
      const id1 = orchestrator.generateJobId();
      const id2 = orchestrator.generateJobId();

      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^job_\d+_[a-z0-9]+$/);
    });
  });

  describe('getJobHistory', () => {
    it('should return empty array initially', () => {
      const history = orchestrator.getJobHistory();
      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBe(0);
    });

    it('should respect limit parameter', () => {
      // Add mock jobs to history
      for (let i = 0; i < 25; i++) {
        orchestrator.jobHistory.push({ id: `job_${i}` });
      }

      const history = orchestrator.getJobHistory(10);
      expect(history.length).toBe(10);
    });
  });
});
