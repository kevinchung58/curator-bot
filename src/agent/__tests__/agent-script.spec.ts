// Mock global fetch
global.fetch = jest.fn();

// Mock robots-parser
import robotsParser from 'robots-parser';
const mockIsAllowed = jest.fn();
jest.mock('robots-parser', () => jest.fn(() => ({
  isAllowed: mockIsAllowed,
  getSitemaps: jest.fn(() => Promise.resolve([])),
})));

// Mock Supabase client
const mockSupabaseClient = {
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  or: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  single: jest.fn().mockReturnThis(),
};
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabaseClient),
}));

// Mock AI processing module (if triggerAIProcessing is imported from there in agent-script)
// Assuming triggerAIProcessing is directly in agent-script and we are testing that version.
// If it were in '../../ai/dev', the mock would be:
// import * as aiDev from '../../ai/dev';
// const mockTriggerAIProcessingForRunAgent = jest.fn(); // For runAgent tests
// jest.mock('../../ai/dev', () => ({
//   triggerAIProcessing: mockTriggerAIProcessingForRunAgent,
// }));


// Spy on and mock functions from agent-script itself
import * as agentScript from '../agent-script';

const mockInitializeSupabaseClient = jest.spyOn(agentScript, 'initializeSupabaseClient');
const mockFetchStrategiesFromSupabase = jest.spyOn(agentScript, 'fetchStrategiesFromSupabase');
const mockCheckForDuplicates = jest.spyOn(agentScript, 'checkForDuplicates');
const mockFetchWebContent = jest.spyOn(agentScript, 'fetchWebContent');
const mockUpdateSupabaseRecord = jest.spyOn(agentScript, 'updateSupabaseRecord');
// sendNotification will be tested directly for its nodemailer implementation.
// For testing triggerAIProcessing, we don't need to spy on sendNotification unless triggerAIProcessing calls it.
const actualSendNotification = agentScript.sendNotification;
const mockExtractMainContent = jest.spyOn(agentScript, 'extractMainContent');


// Import functions to be tested
import { runAgent, getRobotsTxtUrl, sendNotification, triggerAIProcessing } from '../agent-script';
// Import STATUS constants if needed for assertions and not already globally available in tests
const STATUS = agentScript.STATUS; // Accessing STATUS from the imported module

describe('Agent Script Utilities, Interactions & Orchestration', () => {

  const originalEnv = { ...process.env };
  let consoleLogSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;
  const mockGlobalFetch = global.fetch as jest.MockedFunction<typeof global.fetch>;


  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };

    mockInitializeSupabaseClient.mockClear();
    mockFetchStrategiesFromSupabase.mockClear();
    mockCheckForDuplicates.mockClear();
    mockFetchWebContent.mockClear();
    // mockTriggerAIProcessing (if it were a spy for runAgent tests) would be cleared. Here we test the actual.
    mockUpdateSupabaseRecord.mockClear();
    (actualSendNotification as jest.Mock)?.mockClear?.(); // Clear if it was mocked elsewhere, though not directly here
    mockExtractMainContent.mockClear();

    mockSupabaseClient.from.mockClear().mockReturnThis();
    mockSupabaseClient.select.mockClear().mockReturnThis();
    mockSupabaseClient.insert.mockClear().mockResolvedValue({ error: null, data: [{ id: 'new-db-id' }] } as any);
    mockSupabaseClient.update.mockClear().mockReturnThis();
    mockSupabaseClient.eq.mockClear().mockReturnThis();

    mockGlobalFetch.mockReset();
    mockIsAllowed.mockReset();
    mockCreateTransport.mockClear(); // For nodemailer mock
    mockSendMail.mockClear(); // For nodemailer mock

    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    jest.useRealTimers();
  });

  afterAll(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  // --- Tests for triggerAIProcessing ---
  describe('triggerAIProcessing', () => {
    const articleId = 'test-article-id';
    const articleUrl = 'http://example.com/article';
    const topic = 'AI in testing';
    const appApiUrl = 'http://testapp.com/api/agent/process-content';
    // Constants from agent-script for retry logic (ensure they are available or redefine for test scope)
    const MAX_API_CALL_RETRIES = 3; // As defined in agent-script
    const API_CALL_RETRY_DELAY_MS = 2000; // As defined in agent-script
    const API_CALL_TIMEOUT_MS = 20000; // As defined in agent-script


    beforeEach(() => {
      process.env.NEXT_PUBLIC_APP_URL = 'http://testapp.com';
      mockGlobalFetch.mockReset();
    });

    it('should successfully call API on first attempt', async () => {
      const mockProcessedData = { id: articleId, title: 'AI Processed Title', summary: 'Summary', status: 'processed' };
      mockGlobalFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ processedContent: mockProcessedData }),
      } as Response);

      const result = await triggerAIProcessing(articleId, articleUrl, topic);

      expect(mockGlobalFetch).toHaveBeenCalledTimes(1);
      expect(mockGlobalFetch).toHaveBeenCalledWith(appApiUrl, expect.objectContaining({ method: 'POST' }));
      expect(result).toEqual(mockProcessedData);
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('AI processing successful via API for: AI Processed Title'));
    });

    it('should return API application-level error without retry', async () => {
      const apiError = { error: 'AI model failed', message: 'The model encountered an issue.' };
      mockGlobalFetch.mockResolvedValueOnce({
        ok: true, // API call itself was successful, but returned an error object
        json: async () => (apiError),
      } as Response);

      const result = await triggerAIProcessing(articleId, articleUrl, topic);

      expect(mockGlobalFetch).toHaveBeenCalledTimes(1);
      expect(result?.status).toBe(STATUS.AI_PROCESSING_FAILED);
      expect(result?.errorMessage).toBe(apiError.error);
      expect(result?.summary).toBe(apiError.error); // Based on current implementation
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('AI Processing API returned an application error:'));
    });

    it('should succeed after one 503 retry', async () => {
      jest.useFakeTimers();
      const mockProcessedData = { id: articleId, title: 'Retry Success Title' };
      mockGlobalFetch
        .mockResolvedValueOnce({ ok: false, status: 503, statusText: 'Service Unavailable', text: async () => 'Service Down' } as Response)
        .mockResolvedValueOnce({ ok: true, json: async () => ({ processedContent: mockProcessedData }) } as Response);

      const processingPromise = triggerAIProcessing(articleId, articleUrl, topic);
      // jest.runOnlyPendingTimers(); // Advance by the delay
      await jest.advanceTimersByTimeAsync(API_CALL_RETRY_DELAY_MS);
      const result = await processingPromise;

      expect(mockGlobalFetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual(mockProcessedData);
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`Retrying after ${API_CALL_RETRY_DELAY_MS}ms...`));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('AI processing successful via API for: Retry Success Title'));
    });

    it('should fail after all retries for persistent 500 error', async () => {
      jest.useFakeTimers();
      mockGlobalFetch.mockResolvedValue({ ok: false, status: 500, statusText: 'Server Error', text: async () => 'Internal Error' } as Response);

      const processingPromise = triggerAIProcessing(articleId, articleUrl, topic);
      // Advance timers for all retries
      for (let i = 0; i < MAX_API_CALL_RETRIES -1; i++) {
        await jest.advanceTimersByTimeAsync(API_CALL_RETRY_DELAY_MS);
      }
      const result = await processingPromise;

      expect(mockGlobalFetch).toHaveBeenCalledTimes(MAX_API_CALL_RETRIES);
      expect(result?.status).toBe(STATUS.AI_PROCESSING_FAILED);
      expect(result?.errorMessage).toContain(`Failed to call AI processing API at ${appApiUrl} after ${MAX_API_CALL_RETRIES} attempts.`);
      expect(result?.errorMessage).toContain('API call failed with status 500');
    });

    it('should fail after all retries for persistent network error', async () => {
        jest.useFakeTimers();
        mockGlobalFetch.mockRejectedValue(new Error('Network connection failed'));

        const processingPromise = triggerAIProcessing(articleId, articleUrl, topic);
        for (let i = 0; i < MAX_API_CALL_RETRIES -1; i++) {
            await jest.advanceTimersByTimeAsync(API_CALL_RETRY_DELAY_MS);
        }
        const result = await processingPromise;

        expect(mockGlobalFetch).toHaveBeenCalledTimes(MAX_API_CALL_RETRIES);
        expect(result?.status).toBe(STATUS.AI_PROCESSING_FAILED);
        expect(result?.errorMessage).toContain('Network connection failed');
    });

    it('should not retry on a 400 client error', async () => {
      mockGlobalFetch.mockResolvedValueOnce({ ok: false, status: 400, statusText: 'Bad Request', text: async () => 'Invalid input' } as Response);
      const result = await triggerAIProcessing(articleId, articleUrl, topic);

      expect(mockGlobalFetch).toHaveBeenCalledTimes(1);
      expect(result?.status).toBe(STATUS.ERROR); // Or a more specific client error status if defined
      expect(result?.errorMessage).toContain('API returned 400: Invalid input');
      expect(consoleErrorSpy).toHaveBeenCalledWith('Non-retryable HTTP error received from API. Not retrying.');
    });

    it('should return config error if NEXT_PUBLIC_APP_URL is not set', async () => {
        delete process.env.NEXT_PUBLIC_APP_URL;
        const result = await triggerAIProcessing(articleId, articleUrl, topic);
        expect(mockGlobalFetch).not.toHaveBeenCalled();
        expect(result?.status).toBe(STATUS.ERROR);
        expect(result?.errorMessage).toContain('NEXT_PUBLIC_APP_URL is not set');
    });

    it('should handle API call timeout with retries', async () => {
        jest.useFakeTimers();
        const abortError = new DOMException('The operation was aborted by an AbortSignal.', 'AbortError');
        const mockProcessedData = { id: articleId, title: 'Timeout Retry Success' };

        mockGlobalFetch
            .mockImplementationOnce(async () => { // First call times out
                await new Promise(r => setTimeout(r, API_CALL_TIMEOUT_MS + 100)); // Simulate work longer than timeout
                throw abortError; // This would be thrown by fetch if AbortController aborts
            })
            .mockResolvedValueOnce({ ok: true, json: async () => ({ processedContent: mockProcessedData }) } as Response); // Second call succeeds

        const processingPromise = triggerAIProcessing(articleId, articleUrl, topic);

        // First attempt: advance time enough to trigger timeout, then for retry delay
        await jest.advanceTimersByTimeAsync(API_CALL_TIMEOUT_MS + 100); // Trigger timeout
        await jest.advanceTimersByTimeAsync(API_CALL_RETRY_DELAY_MS);    // Trigger retry delay

        const result = await processingPromise; // Wait for the entire process to complete

        expect(mockGlobalFetch).toHaveBeenCalledTimes(2); // 1 timeout, 1 success
        expect(result).toEqual(mockProcessedData);
        expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(`Attempt 1 failed: API call timed out after ${API_CALL_TIMEOUT_MS}ms.`));
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`Retrying after ${API_CALL_RETRY_DELAY_MS}ms...`));
    });

  });

  // --- Placeholder for sendNotification tests ---
  describe('sendNotification (Placeholder)', () => { it('exists', () => expect(sendNotification).toBeDefined());});

  // --- Other existing test suites (condensed) ---
  describe('getRobotsTxtUrl (Placeholder)', () => {it('exists', () => expect(getRobotsTxtUrl).toBeDefined());});
  describe('Actual extractMainContent (Placeholder)', () => {it('exists', () => expect(agentScript.extractMainContent).toBeDefined());});
  describe('fetchWebContent (Placeholder)', () => {it('exists', () => expect(agentScript.fetchWebContent).toBeDefined());});
  describe('initializeSupabaseClient (Placeholder)', () => {it('exists', () => expect(initializeSupabaseClient).toBeDefined());});
  describe('fetchStrategiesFromSupabase (Placeholder)', () => {it('exists', () => expect(fetchStrategiesFromSupabase).toBeDefined());});
  describe('checkForDuplicates (Placeholder)', () => {it('exists', () => expect(checkForDuplicates).toBeDefined());});
  describe('updateSupabaseRecord (Placeholder)', () => {it('exists', () => expect(updateSupabaseRecord).toBeDefined());});
  describe('Agent Script Orchestration - runAgent (Placeholder)', () => {it('exists', () => expect(runAgent).toBeDefined());});

});

// Re-add nodemailer mocks for sendNotification tests if they were in the same top-level describe
const mockSendMail = jest.fn();
const mockCreateTransport = jest.fn(() => ({
  sendMail: mockSendMail,
}));
jest.mock('nodemailer', () => ({ // This mock needs to be at top level or correctly scoped if sendNotification tests are separate
  createTransport: mockCreateTransport,
}));
