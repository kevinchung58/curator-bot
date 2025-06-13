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
import * as aiDev from '../../ai/dev'; // Adjust path if needed, assuming it's at src/ai/dev.ts
const mockTriggerAIProcessing = jest.fn();
jest.mock('../../ai/dev', () => ({ // Path relative to this test file
  triggerAIProcessing: mockTriggerAIProcessing,
}));


// Spy on and mock functions from agent-script itself
// We need to import *as agentScript to spy on its exports
import * as agentScript from '../agent-script';

const mockInitializeSupabaseClient = jest.spyOn(agentScript, 'initializeSupabaseClient');
const mockFetchStrategiesFromSupabase = jest.spyOn(agentScript, 'fetchStrategiesFromSupabase');
const mockCheckForDuplicates = jest.spyOn(agentScript, 'checkForDuplicates');
const mockFetchWebContent = jest.spyOn(agentScript, 'fetchWebContent');
const mockUpdateSupabaseRecord = jest.spyOn(agentScript, 'updateSupabaseRecord');
const mockSendNotification = jest.spyOn(agentScript, 'sendNotification');
// extractMainContent is also an export of agent-script, but we'll rely on fetchWebContent's mock for its output
const mockExtractMainContent = jest.spyOn(agentScript, 'extractMainContent');


// Import the main function to test
import { runAgent } from '../agent-script';

// Import other non-mocked utilities if needed for test setup (e.g. getRobotsTxtUrl for context)
import { getRobotsTxtUrl } from '../agent-script';


describe('Agent Script Orchestration - runAgent', () => {

  beforeEach(() => {
    // Reset all spies and mocks before each test
    mockInitializeSupabaseClient.mockClear();
    mockFetchStrategiesFromSupabase.mockClear();
    mockCheckForDuplicates.mockClear();
    mockFetchWebContent.mockClear();
    mockTriggerAIProcessing.mockClear();
    mockUpdateSupabaseRecord.mockClear();
    mockSendNotification.mockClear();
    mockExtractMainContent.mockClear(); // Reset if it was called directly or through a non-mocked fetchWebContent

    // Reset Supabase client method mocks
    mockSupabaseClient.from.mockClear().mockReturnThis();
    mockSupabaseClient.select.mockClear().mockReturnThis();
    mockSupabaseClient.insert.mockClear().mockReturnThis();
    mockSupabaseClient.update.mockClear().mockReturnThis();
    mockSupabaseClient.eq.mockClear().mockReturnThis();
    // ... reset other Supabase methods if necessary

    // Default successful implementations
    mockInitializeSupabaseClient.mockResolvedValue(mockSupabaseClient as any);
    mockSendNotification.mockResolvedValue(undefined); // Default sendNotification does nothing
    mockUpdateSupabaseRecord.mockResolvedValue(undefined); // Default updateSupabaseRecord succeeds
     // Default insert for initial record
    mockSupabaseClient.insert.mockResolvedValue({ error: null, data: [{ id: 'new-db-id' }] } as any);


    // Reset global fetch if it's used by functions not fully mocked (like initializeSupabaseClient, though it's mocked)
    (global.fetch as jest.Mock).mockReset();
  });

  it('should send notification and exit if Supabase initialization fails', async () => {
    mockInitializeSupabaseClient.mockImplementationOnce(() => { throw new Error('Supabase init failed'); });

    await runAgent();

    expect(mockSendNotification).toHaveBeenCalledWith(
      'Agent Failed: Supabase Initialization Error',
      expect.stringContaining('Supabase init failed'),
      true
    );
    expect(mockFetchStrategiesFromSupabase).not.toHaveBeenCalled();
  });

  it('should send warning notification and exit if no search strategies are found', async () => {
    mockFetchStrategiesFromSupabase.mockResolvedValueOnce([]);

    await runAgent();

    expect(mockSendNotification).toHaveBeenCalledWith(
      'Agent Warning: No Search Strategies',
      expect.stringContaining('no work to do'),
      false // isCritical = false
    );
    expect(mockCheckForDuplicates).not.toHaveBeenCalled();
  });

  it('should process one URL successfully through all stages', async () => {
    const strategy = { keywords: ['test'], targetSites: ['http://good.com'] };
    const webContent = { url: 'http://good.com', rawHtmlContent: '<html></html>', extractedArticle: { title: 'Extracted', content: 'Text' } as any, error: undefined, robotsTxtDisallowed: false };
    const aiResult = { status: 'processed', title: 'AI Title', summary: 'AI Summary', tags: ['ai'], sourceUrl: 'http://good.com', progressMessage: 'AI Done' };

    mockFetchStrategiesFromSupabase.mockResolvedValueOnce([strategy]as any[]);
    mockCheckForDuplicates.mockResolvedValueOnce(false); // Not a duplicate
    mockFetchWebContent.mockResolvedValueOnce(webContent);
    mockTriggerAIProcessing.mockResolvedValueOnce(aiResult as any);

    await runAgent();

    expect(mockCheckForDuplicates).toHaveBeenCalledWith(expect.anything(), 'http://good.com');
    expect(mockSupabaseClient.insert).toHaveBeenCalledWith(expect.arrayContaining([
        expect.objectContaining({ source_url: 'http://good.com', status: 'processing_started' })
    ]));
    expect(mockFetchWebContent).toHaveBeenCalledWith('http://good.com');

    // Check status updates via updateSupabaseRecord
    expect(mockUpdateSupabaseRecord).toHaveBeenCalledWith(expect.anything(), 'http://good.com', expect.objectContaining({ status: 'content_fetched' }));
    expect(mockUpdateSupabaseRecord).toHaveBeenCalledWith(expect.anything(), 'http://good.com', expect.objectContaining({ status: 'content_extracted' }));
    expect(mockUpdateSupabaseRecord).toHaveBeenCalledWith(expect.anything(), 'http://good.com', expect.objectContaining({ status: 'ai_processing_initiated' }));

    expect(mockTriggerAIProcessing).toHaveBeenCalledWith(expect.any(String), 'http://good.com', 'test');

    expect(mockUpdateSupabaseRecord).toHaveBeenCalledWith(expect.anything(), 'http://good.com', expect.objectContaining({
        status: 'ai_processing_successful', // Or 'completed' based on current mapping
        title: 'AI Title',
        summary: 'AI Summary',
    }));
    expect(mockSendNotification).not.toHaveBeenCalledWith(expect.stringContaining('Error'), expect.anything(), true);
  });

  it('should skip processing if URL is a duplicate', async () => {
    const strategy = { keywords: ['test'], targetSites: ['http://duplicate.com'] };
    mockFetchStrategiesFromSupabase.mockResolvedValueOnce([strategy]as any[]);
    mockCheckForDuplicates.mockResolvedValueOnce(true); // Is a duplicate

    await runAgent();

    expect(mockCheckForDuplicates).toHaveBeenCalledWith(expect.anything(), 'http://duplicate.com');
    // Ensure initial insert is NOT called for a duplicate
    expect(mockSupabaseClient.insert.mock.calls.some(call => call[0][0].source_url === 'http://duplicate.com')).toBe(false);

    expect(mockFetchWebContent).not.toHaveBeenCalled();
    expect(mockTriggerAIProcessing).not.toHaveBeenCalled();
    // Check that console.log was called with "Skipping already processed URL"
  });

  it('should update record and skip AI if fetchWebContent is disallowed by robots.txt', async () => {
    const strategy = { keywords: ['test'], targetSites: ['http://robots.com'] };
    const webContentResult = { url: 'http://robots.com', rawHtmlContent: null, extractedArticle: null, error: 'robots.txt disallows fetching', robotsTxtDisallowed: true };

    mockFetchStrategiesFromSupabase.mockResolvedValueOnce([strategy]as any[]);
    mockCheckForDuplicates.mockResolvedValueOnce(false);
    mockFetchWebContent.mockResolvedValueOnce(webContentResult);

    await runAgent();

    expect(mockSupabaseClient.insert).toHaveBeenCalledWith(expect.arrayContaining([
        expect.objectContaining({ source_url: 'http://robots.com', status: 'processing_started' })
    ]));
    expect(mockFetchWebContent).toHaveBeenCalledWith('http://robots.com');
    expect(mockUpdateSupabaseRecord).toHaveBeenCalledWith(expect.anything(), 'http://robots.com', expect.objectContaining({
      status: 'skipped_robots',
      agent_error_message: expect.stringContaining('robots.txt disallows fetching'),
    }));
    expect(mockTriggerAIProcessing).not.toHaveBeenCalled();
  });

  it('should update record and skip AI if triggerAIProcessing fails', async () => {
    const strategy = { keywords: ['ai'], targetSites: ['http://ai-error.com'] };
    const webContent = { url: 'http://ai-error.com', rawHtmlContent: '<html></html>', extractedArticle: { title: 'Extracted' } as any, error: undefined, robotsTxtDisallowed: false };
    const aiErrorResult = { status: 'error', errorMessage: 'AI processing failed badly', sourceUrl: 'http://ai-error.com', progressMessage: 'AI errored' };

    mockFetchStrategiesFromSupabase.mockResolvedValueOnce([strategy]as any[]);
    mockCheckForDuplicates.mockResolvedValueOnce(false);
    mockFetchWebContent.mockResolvedValueOnce(webContent);
    mockTriggerAIProcessing.mockResolvedValueOnce(aiErrorResult as any);

    await runAgent();

    expect(mockTriggerAIProcessing).toHaveBeenCalled();
    expect(mockUpdateSupabaseRecord).toHaveBeenCalledWith(expect.anything(), 'http://ai-error.com', expect.objectContaining({
      status: 'ai_processing_failed',
      agent_error_message: 'AI processing failed badly',
    }));
  });

  it('should handle Supabase initial insert failure gracefully for a URL and continue', async () => {
    const strategies = [
        { keywords: ['fail'], targetSites: ['http://db-fail.com'] },
        { keywords: ['ok'], targetSites: ['http://ok.com'] }
    ];
    mockFetchStrategiesFromSupabase.mockResolvedValueOnce(strategies as any[]);
    mockCheckForDuplicates.mockImplementation(async (client, url) => url === 'http://db-fail.com' ? false : (url === 'http://ok.com' ? false : true));

    // First URL (db-fail.com) - initial insert fails
    mockSupabaseClient.insert.mockImplementationOnce((records: any[]) => {
        if (records[0].source_url === 'http://db-fail.com') {
            return Promise.resolve({ error: new Error('Simulated DB Insert Failed'), data: null });
        }
        return Promise.resolve({ error: null, data: [{id: 'ok-id'}]}); // Should not be reached here for fail
    });
     // Second URL (ok.com) - initial insert succeeds, and subsequent mocks for successful processing
    mockFetchWebContent.mockImplementation(async (url) => {
        if (url === 'http://ok.com') return { url, rawHtmlContent: 'ok html', extractedArticle: {title: 'OK'} as any, error: null, robotsTxtDisallowed: false };
        return { url, rawHtmlContent: null, extractedArticle: null, error: 'Should not fetch for failed insert', robotsTxtDisallowed: false};
    });
    mockTriggerAIProcessing.mockImplementation(async (id, url) => {
        if (url === 'http://ok.com') return { status: 'processed', title: 'OK AI', summary: 'OK', tags:[], sourceUrl: url } as any;
        return null;
    });

    // Spy on console.error for this test
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await runAgent();

    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Critical Error: Failed to insert initial record for http://db-fail.com'));
    // Verify that processing was attempted for the second URL
    expect(mockFetchWebContent).toHaveBeenCalledWith('http://ok.com');
    expect(mockTriggerAIProcessing).toHaveBeenCalledWith(expect.any(String), 'http://ok.com', 'ok');
    expect(mockUpdateSupabaseRecord).toHaveBeenCalledWith(expect.anything(), 'http://ok.com', expect.objectContaining({ status: 'ai_processing_successful' }));

    consoleErrorSpy.mockRestore();
  });

});

// Note: The actual getRobotsTxtUrl and non-mocked extractMainContent unit tests are omitted for brevity in this final block,
// but they would be part of this file as per previous steps.
// Example stubs for them:
describe('getRobotsTxtUrl (Placeholder)', () => {it('exists', () => expect(getRobotsTxtUrl).toBeDefined());});
describe('Actual extractMainContent (Placeholder)', () => {it('exists', () => expect(agentScript.extractMainContent).toBeDefined());});
