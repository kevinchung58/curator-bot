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
const mockFetchWebContent = jest.spyOn(agentScript, 'fetchWebContent'); // Spy on the actual implementation
const mockUpdateSupabaseRecord = jest.spyOn(agentScript, 'updateSupabaseRecord');
const mockAgentSendNotification = jest.spyOn(agentScript, 'sendNotification');
const actualExtractMainContent = agentScript.extractMainContent;


// Import functions to be tested
import { runAgent, getRobotsTxtUrl, sendNotification, triggerAIProcessing } from '../agent-script';
const STATUS = agentScript.STATUS;
const HEARTBEAT_TIMEOUT_MS_TEST = 5000;

// Update this to reflect the change in agent-script.ts
const MAX_CRAWL_DEPTH_FROM_SCRIPT = 2; // Updated from 1 to 2
const MAX_DISCOVERED_LINKS_PER_STRATEGY_SITE_FROM_SCRIPT = 10; // Based on current script


describe('Agent Script Utilities, Interactions & Orchestration', () => {

  const originalEnv = { ...process.env };
  let consoleLogSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;
  const mockGlobalFetch = global.fetch as jest.MockedFunction<typeof global.fetch>;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };

    [ mockInitializeSupabaseClient, mockFetchStrategiesFromSupabase, mockCheckForDuplicates,
      mockFetchWebContent, mockTriggerAIProcessing, mockUpdateSupabaseRecord,
      mockAgentSendNotification,
      (agentScript.extractMainContent as jest.MockedFunction<typeof actualExtractMainContent>)
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

  describe('Agent Script Orchestration - runAgent (Link Discovery & Depth)', () => {
    const initialSiteUrl = 'http://origin.com/page0';
    const linkDepth1PageA = 'http://origin.com/pageA';
    const linkDepth2PageB = 'http://origin.com/pageB'; // Discovered from linkDepth1PageA (depth 2)
    const linkDepth3PageC = 'http://origin.com/pageC'; // Discovered from linkDepth2PageB (depth 3)
    const baseStrategyKeywords = ['keywords'];

    it('should process up to MAX_CRAWL_DEPTH (2), skipping links at depth 3', async () => {
      const strategies = [{ keywords: baseStrategyKeywords, targetSites: [initialSiteUrl] }];
      mockFetchStrategiesFromSupabase.mockResolvedValueOnce(strategies as any[]);
      mockCheckForDuplicates.mockResolvedValue(false); // All URLs are new to DB

      // Mocking fetchWebContent calls:
      // 1. initialSiteUrl (depth 0) -> discovers linkDepth1PageA
      mockFetchWebContent.mockImplementationOnce(async (url) => {
        expect(url).toBe(initialSiteUrl);
        return {
          url: initialSiteUrl, rawHtmlContent: 'html0',
          extractedArticle: { title: 'Title0', content: 'Content0', htmlContent:'', discoveredLinks: [linkDepth1PageA] } as any,
          error: null, robotsTxtDisallowed: false
        };
      });
      // 2. linkDepth1PageA (depth 1) -> discovers linkDepth2PageB
      mockFetchWebContent.mockImplementationOnce(async (url) => {
        expect(url).toBe(linkDepth1PageA);
        return {
          url: linkDepth1PageA, rawHtmlContent: 'htmlA',
          extractedArticle: { title: 'TitleA', content: 'ContentA', htmlContent:'', discoveredLinks: [linkDepth2PageB] } as any,
          error: null, robotsTxtDisallowed: false
        };
      });
      // 3. linkDepth2PageB (depth 2) -> discovers linkDepth3PageC (which should be skipped)
      mockFetchWebContent.mockImplementationOnce(async (url) => {
        expect(url).toBe(linkDepth2PageB);
        return {
          url: linkDepth2PageB, rawHtmlContent: 'htmlB',
          extractedArticle: { title: 'TitleB', content: 'ContentB', htmlContent:'', discoveredLinks: [linkDepth3PageC] } as any,
          error: null, robotsTxtDisallowed: false
        };
      });

      mockTriggerAIProcessing.mockResolvedValue({ status: 'processed', title: 'AI Processed' } as any);

      await runAgent();

      // Verify initial record creation for depth 0, 1, and 2 links
      expect(mockSupabaseClient.insert).toHaveBeenCalledTimes(3); // initialSite, linkA, linkB
      expect(mockSupabaseClient.insert).toHaveBeenCalledWith(expect.arrayContaining([
        expect.objectContaining({ source_url: initialSiteUrl, depth: 0 })
      ]));
      expect(mockSupabaseClient.insert).toHaveBeenCalledWith(expect.arrayContaining([
        expect.objectContaining({ source_url: linkDepth1PageA, depth: 1 })
      ]));
      expect(mockSupabaseClient.insert).toHaveBeenCalledWith(expect.arrayContaining([
        expect.objectContaining({ source_url: linkDepth2PageB, depth: 2 })
      ]));

      expect(mockFetchWebContent).toHaveBeenCalledTimes(3);
      expect(mockFetchWebContent).toHaveBeenCalledWith(initialSiteUrl);
      expect(mockFetchWebContent).toHaveBeenCalledWith(linkDepth1PageA);
      expect(mockFetchWebContent).toHaveBeenCalledWith(linkDepth2PageB);
      expect(mockFetchWebContent).not.toHaveBeenCalledWith(linkDepth3PageC); // Crucial check for depth limit

      expect(mockTriggerAIProcessing).toHaveBeenCalledTimes(3);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`Skipping discovered link (depth limit exceeded 3 > ${MAX_CRAWL_DEPTH_FROM_SCRIPT})`));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`Further link discovery from page ${linkDepth2PageB} will exceed MAX_CRAWL_DEPTH. Stopping discovery from this page.`));
    });

    it('should respect MAX_DISCOVERED_LINKS_PER_STRATEGY_SITE across depths, up to MAX_CRAWL_DEPTH', async () => {
        // MAX_CRAWL_DEPTH_FROM_SCRIPT = 2
        // MAX_DISCOVERED_LINKS_PER_STRATEGY_SITE_FROM_SCRIPT = 10
        const strategies = [{ keywords: baseStrategyKeywords, targetSites: [initialSiteUrl] }];
        mockFetchStrategiesFromSupabase.mockResolvedValueOnce(strategies as any[]);
        mockCheckForDuplicates.mockResolvedValue(false);

        const links_d1 = Array.from({ length: 3 }, (_, i) => `http://origin.com/d1_link${i}`); // 3 links at depth 1
        const links_d2_from_d1_link0 = Array.from({ length: 8 }, (_, i) => `http://origin.com/d1_link0_d2_link${i}`); // 8 links at depth 2

        // Mocking fetchWebContent calls:
        // 1. initialSiteUrl (depth 0) -> discovers links_d1 (3 links)
        mockFetchWebContent.mockImplementationOnce(async (url) => { // For initialSiteUrl
            return { url, rawHtmlContent: 'html0', extractedArticle: { title: 'T0', content: 'C0', htmlContent:'', discoveredLinks: links_d1 } as any, error: null, robotsTxtDisallowed: false };
        });

        // Mocks for depth 1 links (links_d1)
        mockFetchWebContent.mockImplementationOnce(async (url) => { // For links_d1[0]
            return { url, rawHtmlContent: 'html_d1_0', extractedArticle: { title: 'T_d1_0', content: 'C_d1_0', htmlContent:'', discoveredLinks: links_d2_from_d1_link0 } as any, error: null, robotsTxtDisallowed: false };
        });
        mockFetchWebContent.mockImplementationOnce(async (url) => { // For links_d1[1]
            return { url, rawHtmlContent: 'html_d1_1', extractedArticle: { title: 'T_d1_1', content: 'C_d1_1', htmlContent:'', discoveredLinks: ['http://origin.com/another_d2_link_from_d1_1'] } as any, error: null, robotsTxtDisallowed: false };
        });
         mockFetchWebContent.mockImplementationOnce(async (url) => { // For links_d1[2]
            return { url, rawHtmlContent: 'html_d1_2', extractedArticle: { title: 'T_d1_2', content: 'C_d1_2', htmlContent:'', discoveredLinks: [] } as any, error: null, robotsTxtDisallowed: false };
        });

        // Mocks for depth 2 links discovered from links_d1[0] (up to the limit)
        // We expect 7 of these to be processed (3 already from depth 1 + 7 from depth 2 = 10)
        for (let i = 0; i < 7; i++) {
            mockFetchWebContent.mockImplementationOnce(async (url) => {
                return { url, rawHtmlContent: `html_d2_${i}`, extractedArticle: { title: `T_d2_${i}`, content: `C_d2_${i}`, htmlContent:'', discoveredLinks: [] } as any, error: null, robotsTxtDisallowed: false };
            });
        }
        // Mock for the 11th discovered link's parent (links_d1[1]'s child), which should not be fetched if limit hit by links_d1[0]'s children
         mockFetchWebContent.mockImplementationOnce(async (url) => {
             // This mock is for http://origin.com/another_d2_link_from_d1_1
             // It should only be called if the limit of 10 wasn't exhausted by children of links_d1[0]
            return { url, rawHtmlContent: `html_d1_1_child`, extractedArticle: { title: `T_d1_1_child`, content: `C_d1_1_child`, htmlContent:'', discoveredLinks: [] } as any, error: null, robotsTxtDisallowed: false };
        });


        mockTriggerAIProcessing.mockResolvedValue({ status: 'processed' } as any);
        await runAgent();

        // Total URLs processed: 1 (initial) + 3 (d1) + 7 (d2 from d1_link0's children) = 11
        expect(mockFetchWebContent).toHaveBeenCalledTimes(1 + 3 + 7);
        expect(mockSupabaseClient.insert).toHaveBeenCalledTimes(1 + 3 + 7);

        // Verify that the 8th link from links_d1[0]'s discovery (links_d2_from_d1_link0[7]) was skipped due to MAX_DISCOVERED_LINKS_PER_STRATEGY_SITE
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`Reached max discovered links (${MAX_DISCOVERED_LINKS_PER_STRATEGY_SITE_FROM_SCRIPT}) for origin ${initialSiteUrl}.`));
        // Check that another_d2_link_from_d1_1 was NOT fetched because the limit was hit by children of d1_link0
        expect(mockFetchWebContent).not.toHaveBeenCalledWith('http://origin.com/another_d2_link_from_d1_1');
    });

    // Placeholder for other runAgent tests as they might need minor adjustments for the depth field in queue objects
    it('should skip duplicate URL (already in DB)', async () => {
        const strategies = [{ keywords: baseStrategyKeywords, targetSites: [initialSiteUrl] }];
        mockFetchStrategiesFromSupabase.mockResolvedValueOnce(strategies as any[]);
        mockCheckForDuplicates.mockResolvedValueOnce(true); // initialSiteUrl is a duplicate in DB
        await runAgent();
        expect(mockFetchWebContent).not.toHaveBeenCalled();
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`Skipping ${initialSiteUrl} as it's already processed in DB.`));
    });

  });

  // --- Other existing test suites (condensed placeholders for brevity) ---
  // (sendNotification, getRobotsTxtUrl, actualExtractMainContent, fetchWebContent (unit), initializeSupabaseClient, etc.)
  // (triggerAIProcessing (unit tests))
});
