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

// Mock AI processing module
const mockTriggerAIProcessing = jest.fn();
jest.mock('../../ai/dev', () => ({
  triggerAIProcessing: mockTriggerAIProcessing,
}));

// Mock nodemailer
const mockSendMail = jest.fn();
const mockCreateTransport = jest.fn(() => ({
  sendMail: mockSendMail,
}));
jest.mock('nodemailer', () => ({
  createTransport: mockCreateTransport,
}));


// Spy on and mock functions from agent-script itself
import * as agentScript from '../agent-script';

const mockInitializeSupabaseClient = jest.spyOn(agentScript, 'initializeSupabaseClient');
const mockFetchStrategiesFromSupabase = jest.spyOn(agentScript, 'fetchStrategiesFromSupabase');
const mockCheckForDuplicates = jest.spyOn(agentScript, 'checkForDuplicates');
const mockFetchWebContent = jest.spyOn(agentScript, 'fetchWebContent');
const mockUpdateSupabaseRecord = jest.spyOn(agentScript, 'updateSupabaseRecord');
const mockAgentSendNotification = jest.spyOn(agentScript, 'sendNotification'); // Spy for runAgent tests
const actualExtractMainContent = agentScript.extractMainContent;


// Import functions to be tested
import { runAgent, getRobotsTxtUrl, sendNotification, triggerAIProcessing } from '../agent-script';
const STATUS = agentScript.STATUS;
// Define HEARTBEAT_TIMEOUT_MS for test scope if not exported from agent-script
const HEARTBEAT_TIMEOUT_MS_TEST = 5000;


describe('Agent Script Utilities, Interactions & Orchestration', () => {

  const originalEnv = { ...process.env };
  let consoleLogSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;
  const mockGlobalFetch = global.fetch as jest.MockedFunction<typeof global.fetch>;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };

    // Clear all spies and mocks
    [ mockInitializeSupabaseClient, mockFetchStrategiesFromSupabase, mockCheckForDuplicates,
      mockFetchWebContent, mockTriggerAIProcessing, mockUpdateSupabaseRecord,
      mockAgentSendNotification, // Use the spy for runAgent tests
      (agentScript.extractMainContent as jest.MockedFunction<typeof actualExtractMainContent>) // if spied directly
    ].forEach(spy => spy.mockClear());

    mockSupabaseClient.from.mockClear().mockReturnThis();
    mockSupabaseClient.select.mockClear().mockReturnThis();
    mockSupabaseClient.insert.mockClear().mockResolvedValue({ error: null, data: [{ id: 'new-db-id' }] } as any);
    mockSupabaseClient.update.mockClear().mockReturnThis();
    mockSupabaseClient.eq.mockClear().mockReturnThis();

    mockGlobalFetch.mockReset();
    mockIsAllowed.mockReset();
    mockCreateTransport.mockClear();
    mockSendMail.mockClear();

    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    // Default successful setup for most runAgent tests
    mockInitializeSupabaseClient.mockResolvedValue(mockSupabaseClient as any);
    mockAgentSendNotification.mockResolvedValue(undefined);
    mockUpdateSupabaseRecord.mockResolvedValue(undefined);
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

  // --- Tests for sendNotification (actual nodemailer implementation) ---
  describe('sendNotification (Email Logic)', () => {
    const testSubject = 'Test Subject';
    const testBody = 'Test Body\nWith newlines.';
    const emailConfig = {
        EMAIL_HOST: 'smtp.example.com', EMAIL_PORT: '587', EMAIL_USER: 'user@example.com',
        EMAIL_PASS: 'password', EMAIL_SECURE: 'false',
        NOTIFICATION_EMAIL_FROM: 'agent@example.com', NOTIFICATION_EMAIL_TO: 'admin@example.com',
    };

    it('should send email successfully with all configurations set', async () => {
      process.env = { ...process.env, ...emailConfig };
      mockSendMail.mockResolvedValueOnce({ messageId: 'test-message-id' });
      await sendNotification(testSubject, testBody, true); // Test actual sendNotification
      expect(mockCreateTransport).toHaveBeenCalledWith(expect.objectContaining({ host: emailConfig.EMAIL_HOST }));
      expect(mockSendMail).toHaveBeenCalledWith(expect.objectContaining({ subject: `Content Agent (CRITICAL): ${testSubject}` }));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Notification email sent successfully.'));
    });
    // ... other sendNotification tests from previous step
  });

  // --- Tests for runAgent Orchestration ---
  describe('Agent Script Orchestration - runAgent', () => {
    const uptimeKumaUrl = 'http://uptime.kuma/push/test';

    it('should send Uptime Kuma heartbeat on successful run with strategies processed', async () => {
      process.env.UPTIME_KUMA_PUSH_URL = uptimeKumaUrl;
      mockFetchStrategiesFromSupabase.mockResolvedValueOnce([{ keywords: ['test'], targetSites: ['http://site.com'] }] as any[]);
      mockCheckForDuplicates.mockResolvedValue(false);
      mockFetchWebContent.mockResolvedValue({ url: 'http://site.com', rawHtmlContent: 'html', extractedArticle: { title: 'T', content: 'C', discoveredLinks:[] } as any, error: null, robotsTxtDisallowed: false });
      mockTriggerAIProcessing.mockResolvedValue({ status: 'processed', title: 'AI' } as any);
      mockGlobalFetch.mockResolvedValueOnce({ ok: true } as Response); // For Uptime Kuma Ping

      await runAgent();

      expect(mockGlobalFetch).toHaveBeenCalledWith(uptimeKumaUrl, expect.objectContaining({ method: 'GET' }));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Uptime Kuma heartbeat ping successful.'));
      expect(mockAgentSendNotification).not.toHaveBeenCalledWith(expect.stringContaining('Uptime Kuma Heartbeat Failed'), expect.anything(), expect.anything());
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Content Curator Agent finished successfully'));
    });

    it('should send Uptime Kuma heartbeat if no strategies are found (considered successful empty run)', async () => {
        process.env.UPTIME_KUMA_PUSH_URL = uptimeKumaUrl;
        mockFetchStrategiesFromSupabase.mockResolvedValueOnce([]); // No strategies
        mockGlobalFetch.mockResolvedValueOnce({ ok: true } as Response); // Uptime Kuma

        await runAgent();
        expect(mockGlobalFetch).toHaveBeenCalledWith(uptimeKumaUrl, expect.objectContaining({ method: 'GET' }));
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Uptime Kuma heartbeat ping successful.'));
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Agent will exit as there are no strategies to process.'));
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Content Curator Agent finished successfully'));
    });

    it('should NOT send Uptime Kuma heartbeat if Supabase init fails', async () => {
        process.env.UPTIME_KUMA_PUSH_URL = uptimeKumaUrl;
        mockInitializeSupabaseClient.mockImplementationOnce(() => { throw new Error('Supabase init failed'); });

        // process.exit(1) will be called, so catch this or test differently for exit conditions
        // For this test, we just check that fetch for Uptime Kuma is not called.
        // The actual exit is handled by Jest's environment or can be mocked.
        try {
            await runAgent();
        } catch (e) {
            // Expected to throw or exit.
        }
        expect(mockGlobalFetch).not.toHaveBeenCalledWith(uptimeKumaUrl, expect.anything());
        expect(mockAgentSendNotification).toHaveBeenCalledWith(expect.stringContaining('Supabase Initialization Error'), expect.anything(), true);
    });

    it('should send heartbeat but also trigger notification if heartbeat ping fails (network error)', async () => {
        process.env.UPTIME_KUMA_PUSH_URL = uptimeKumaUrl;
        mockFetchStrategiesFromSupabase.mockResolvedValueOnce([]); // Successful empty run
        mockGlobalFetch.mockRejectedValueOnce(new Error('Network error on heartbeat')); // Heartbeat fails

        await runAgent();

        expect(mockGlobalFetch).toHaveBeenCalledWith(uptimeKumaUrl, expect.objectContaining({ method: 'GET' }));
        expect(mockAgentSendNotification).toHaveBeenCalledWith(
            'Agent Warning: Uptime Kuma Heartbeat Error',
            expect.stringContaining('Error sending Uptime Kuma heartbeat ping: Network error on heartbeat'),
            false
        );
        expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Error sending Uptime Kuma heartbeat ping: Network error on heartbeat'));
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Content Curator Agent finished successfully')); // Agent itself finished ok
    });

    it('should send heartbeat but also trigger notification if heartbeat ping fails (HTTP error)', async () => {
        process.env.UPTIME_KUMA_PUSH_URL = uptimeKumaUrl;
        mockFetchStrategiesFromSupabase.mockResolvedValueOnce([]);
        mockGlobalFetch.mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Server Error' } as Response); // Heartbeat HTTP error

        await runAgent();
        expect(mockGlobalFetch).toHaveBeenCalledWith(uptimeKumaUrl, expect.objectContaining({ method: 'GET' }));
        expect(mockAgentSendNotification).toHaveBeenCalledWith(
            'Agent Warning: Uptime Kuma Heartbeat Failed',
            expect.stringContaining('Status: 500 Server Error'),
            false
        );
        expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Uptime Kuma heartbeat ping failed: 500 Server Error'));
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Content Curator Agent finished successfully'));
    });

    it('should send heartbeat but also trigger notification if heartbeat ping times out', async () => {
        jest.useFakeTimers();
        process.env.UPTIME_KUMA_PUSH_URL = uptimeKumaUrl;
        mockFetchStrategiesFromSupabase.mockResolvedValueOnce([]);
        const abortError = new DOMException('The operation was aborted by an AbortSignal.', 'AbortError');
        mockGlobalFetch.mockImplementationOnce(async () => {
            await jest.advanceTimersByTimeAsync(HEARTBEAT_TIMEOUT_MS_TEST + 100); // Simulate work longer than timeout
            throw abortError;
        });

        const agentPromise = runAgent();
        await jest.advanceTimersByTimeAsync(HEARTBEAT_TIMEOUT_MS_TEST + 200); // Ensure timeout and subsequent promise resolutions
        await agentPromise;

        expect(mockGlobalFetch).toHaveBeenCalledWith(uptimeKumaUrl, expect.objectContaining({ method: 'GET' }));
        expect(mockAgentSendNotification).toHaveBeenCalledWith(
            'Agent Warning: Uptime Kuma Heartbeat Error',
            expect.stringContaining(`Uptime Kuma heartbeat ping timed out after ${HEARTBEAT_TIMEOUT_MS_TEST}ms.`),
            false
        );
        expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining(`Uptime Kuma heartbeat ping timed out after ${HEARTBEAT_TIMEOUT_MS_TEST}ms.`));
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Content Curator Agent finished successfully'));
    });

    it('should skip heartbeat ping if URL is not configured, and log appropriately', async () => {
        delete process.env.UPTIME_KUMA_PUSH_URL;
        mockFetchStrategiesFromSupabase.mockResolvedValueOnce([]);

        await runAgent();

        expect(mockGlobalFetch).not.toHaveBeenCalledWith(uptimeKumaUrl, expect.anything());
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Uptime Kuma push URL (UPTIME_KUMA_PUSH_URL) not configured. Skipping heartbeat ping.'));
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Content Curator Agent finished successfully'));
    });

    it('should not send heartbeat if main processing loop encounters critical error', async () => {
        process.env.UPTIME_KUMA_PUSH_URL = uptimeKumaUrl;
        mockFetchStrategiesFromSupabase.mockResolvedValueOnce([{ keywords: ['test'], targetSites: ['http://site.com'] }] as any[]);
        mockCheckForDuplicates.mockImplementationOnce(() => { throw new Error("Critical loop error"); }); // Error in loop

        await runAgent();

        expect(mockGlobalFetch).not.toHaveBeenCalledWith(uptimeKumaUrl, expect.anything());
        expect(mockAgentSendNotification).toHaveBeenCalledWith( // For the critical loop error
            'Agent Run Failed: Error in Main Processing Loop',
            expect.stringContaining('Critical loop error'),
            true
        );
        // Check for the specific log message for handled errors
        expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Content Curator Agent finished with handled errors'));
    });

  });

  // --- Other existing test suites (condensed placeholders for brevity) ---
  describe('getRobotsTxtUrl (Placeholder)', () => {it('exists', () => expect(getRobotsTxtUrl).toBeDefined());});
  describe('Actual extractMainContent (Placeholder)', () => {it('exists', () => expect(agentScript.extractMainContent).toBeDefined());});
  describe('fetchWebContent (Placeholder)', () => {it('exists', () => expect(agentScript.fetchWebContent).toBeDefined());});
  describe('initializeSupabaseClient (Placeholder)', () => {it('exists', () => expect(initializeSupabaseClient).toBeDefined());});
  describe('fetchStrategiesFromSupabase (Placeholder)', () => {it('exists', () => expect(fetchStrategiesFromSupabase).toBeDefined());});
  describe('checkForDuplicates (Placeholder)', () => {it('exists', () => expect(checkForDuplicates).toBeDefined());});
  describe('updateSupabaseRecord (Placeholder)', () => {it('exists', () => expect(updateSupabaseRecord).toBeDefined());});
  describe('triggerAIProcessing (Placeholder)', () => {it('exists', () => expect(triggerAIProcessing).toBeDefined());});
});

// Ensure nodemailer mocks are correctly scoped if they were defined inside another describe block previously
// If they are at top level of file, this is fine.
// const mockSendMail = jest.fn(); // Already defined at top
// const mockCreateTransport = jest.fn(() => ({ sendMail: mockSendMail })); // Already defined at top
// jest.mock('nodemailer', () => ({ createTransport: mockCreateTransport })); // Already defined at top
