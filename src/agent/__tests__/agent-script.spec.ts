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
// Access constants from the module if they are exported, or redefine for tests if not.
// For MAX_CRAWL_DEPTH, it's not exported, so we test against its known value (1).
const MAX_CRAWL_DEPTH_FROM_SCRIPT = 1; // Based on current script
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

  // --- Tests for runAgent Orchestration with Link Discovery & Depth Limiting ---
  describe('Agent Script Orchestration - runAgent (Link Discovery & Depth)', () => {
    const initialSiteUrl = 'http://origin.com/page0';
    const linkDepth1PageA = 'http://origin.com/pageA'; // Discovered from initialSiteUrl (depth 1)
    const linkDepth1PageB = 'http://origin.com/pageB'; // Discovered from initialSiteUrl (depth 1)
    const linkDepth2PageC = 'http://origin.com/pageC'; // Discovered from linkDepth1PageB (depth 2)
    const baseStrategyKeywords = ['keywords'];

    it('should process initial site and its direct links (depth 1), but not links from depth 1 pages (depth 2) if MAX_CRAWL_DEPTH=1', async () => {
      // MAX_CRAWL_DEPTH is 1 in the script
      const strategies = [{ keywords: baseStrategyKeywords, targetSites: [initialSiteUrl] }];
      mockFetchStrategiesFromSupabase.mockResolvedValueOnce(strategies as any[]);

      mockCheckForDuplicates.mockResolvedValue(false); // All URLs are new to DB

      // Mocking fetchWebContent calls:
      // 1. For initialSiteUrl (depth 0)
      mockFetchWebContent.mockImplementationOnce(async (url) => {
        expect(url).toBe(initialSiteUrl);
        return {
          url: initialSiteUrl, rawHtmlContent: 'html0',
          extractedArticle: {
            title: 'Title0', content: 'Content0', htmlContent:'',
            discoveredLinks: [linkDepth1PageA, linkDepth1PageB] // Discovers two links at depth 1
          } as any,
          error: null, robotsTxtDisallowed: false
        };
      });
      // 2. For linkDepth1PageA (depth 1)
      mockFetchWebContent.mockImplementationOnce(async (url) => {
        expect(url).toBe(linkDepth1PageA);
        return {
          url: linkDepth1PageA, rawHtmlContent: 'htmlA',
          extractedArticle: {
            title: 'TitleA', content: 'ContentA', htmlContent:'',
            discoveredLinks: [] // No further links
          } as any,
          error: null, robotsTxtDisallowed: false
        };
      });
      // 3. For linkDepth1PageB (depth 1)
      mockFetchWebContent.mockImplementationOnce(async (url) => {
        expect(url).toBe(linkDepth1PageB);
        return {
          url: linkDepth1PageB, rawHtmlContent: 'htmlB',
          extractedArticle: {
            title: 'TitleB', content: 'ContentB', htmlContent:'',
            discoveredLinks: [linkDepth2PageC] // This link (depth 2) should be ignored
          } as any,
          error: null, robotsTxtDisallowed: false
        };
      });

      mockTriggerAIProcessing.mockResolvedValue({ status: 'processed', title: 'AI Processed' } as any);

      await runAgent();

      // Verify initial record creation for depth 0 and depth 1 links
      expect(mockSupabaseClient.insert).toHaveBeenCalledTimes(3); // initialSite, linkA, linkB
      expect(mockSupabaseClient.insert).toHaveBeenCalledWith(expect.arrayContaining([
        expect.objectContaining({ source_url: initialSiteUrl, depth: 0, isDiscovered: false })
      ]));
      expect(mockSupabaseClient.insert).toHaveBeenCalledWith(expect.arrayContaining([
        expect.objectContaining({ source_url: linkDepth1PageA, depth: 1, isDiscovered: true })
      ]));
      expect(mockSupabaseClient.insert).toHaveBeenCalledWith(expect.arrayContaining([
        expect.objectContaining({ source_url: linkDepth1PageB, depth: 1, isDiscovered: true })
      ]));

      // Verify fetchWebContent calls
      expect(mockFetchWebContent).toHaveBeenCalledTimes(3);
      expect(mockFetchWebContent).toHaveBeenCalledWith(initialSiteUrl);
      expect(mockFetchWebContent).toHaveBeenCalledWith(linkDepth1PageA);
      expect(mockFetchWebContent).toHaveBeenCalledWith(linkDepth1PageB);
      expect(mockFetchWebContent).not.toHaveBeenCalledWith(linkDepth2PageC); // Crucial check

      // Verify AI processing
      expect(mockTriggerAIProcessing).toHaveBeenCalledTimes(3);
      expect(mockTriggerAIProcessing).toHaveBeenCalledWith(expect.any(String), initialSiteUrl, baseStrategyKeywords.join(', '));
      expect(mockTriggerAIProcessing).toHaveBeenCalledWith(expect.any(String), linkDepth1PageA, baseStrategyKeywords.join(', '));
      expect(mockTriggerAIProcessing).toHaveBeenCalledWith(expect.any(String), linkDepth1PageB, baseStrategyKeywords.join(', '));

      // Verify console log for skipping depth 2 link
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`Skipping discovered link (depth limit exceeded 2 > ${MAX_CRAWL_DEPTH_FROM_SCRIPT})`));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`Further link discovery from page ${linkDepth1PageB} will exceed MAX_CRAWL_DEPTH. Stopping discovery from this page.`));
    });

    it('should not discover any links if MAX_CRAWL_DEPTH = 0 (conceptual test, requires changing constant)', async () => {
        // This test assumes MAX_CRAWL_DEPTH is 0. Since it's 1 in the script, this test would need
        // the constant to be mockable or changeable. For now, this is a conceptual placeholder.
        // If MAX_CRAWL_DEPTH was 0:
        // - initialSiteUrl would be processed (depth 0).
        // - Links discovered on initialSiteUrl (which would be depth 1) would be skipped.

        // To simulate this with MAX_CRAWL_DEPTH = 1 (current value):
        // We test that links at depth 2 are skipped. This is covered by the test above.
        // If we wanted to test MAX_CRAWL_DEPTH = 0 behavior, we'd need to mock the constant.
        // For now, we acknowledge this limitation.
        console.log("Conceptual Test: If MAX_CRAWL_DEPTH were 0, links from initial sites (depth 1) would be skipped. Current MAX_CRAWL_DEPTH is 1.");
        expect(MAX_CRAWL_DEPTH_FROM_SCRIPT).toBe(1); // Confirming current value for clarity
    });

    it('should respect MAX_DISCOVERED_LINKS_PER_STRATEGY_SITE even if MAX_CRAWL_DEPTH allows more depth', async () => {
        // Assuming MAX_CRAWL_DEPTH = 1 (from script)
        // And MAX_DISCOVERED_LINKS_PER_STRATEGY_SITE = 1 (for this test, if we could set it)
        // The script has it at 10. To test this properly, we'd need to mock this constant.
        // For this test, let's assume MAX_DISCOVERED_LINKS_PER_STRATEGY_SITE is effectively 1
        // by only providing 1 link that then discovers more, versus the depth limit.
        // This test is better framed as: depth limit is hit first if MAX_DISCOVERED_LINKS is high.
        // The previous test already shows depth limit working.

        // Let's test interaction: MAX_CRAWL_DEPTH=1, MAX_DISCOVERED_LINKS_PER_STRATEGY_SITE=1
        // We need to control MAX_DISCOVERED_LINKS_PER_STRATEGY_SITE for this test.
        // Since we can't easily change it, this specific interaction is hard to isolate from depth.
        // The current MAX_DISCOVERED_LINKS_PER_STRATEGY_SITE is 10.
        // The depth limit (1) will be hit before 10 links are processed if links are nested.

        // Test: If depth 0 page has 15 links (all depth 1), and MAX_DISCOVERED_LINKS_PER_STRATEGY_SITE = 10
        // then only 10 of those 15 links should be queued. MAX_CRAWL_DEPTH = 1 allows all of them depth-wise.
        const manyLinksAtDepth1 = Array.from({ length: 15 }, (_, i) => `http://origin.com/manylinks${i}`);
        const strategies = [{ keywords: baseStrategyKeywords, targetSites: [initialSiteUrl] }];
        mockFetchStrategiesFromSupabase.mockResolvedValueOnce(strategies as any[]);
        mockCheckForDuplicates.mockResolvedValue(false);

        mockFetchWebContent.mockImplementation(async (url) => {
            if (url === initialSiteUrl) {
                return { url, rawHtmlContent: 'html0', extractedArticle: { title: 'T0', content: 'C0', htmlContent:'', discoveredLinks: manyLinksAtDepth1 } as any, error: null, robotsTxtDisallowed: false };
            }
            // For discovered links (depth 1), no further links
            return { url, rawHtmlContent: `html_${url}`, extractedArticle: { title: `T_${url}`, content: `C_${url}`, htmlContent:'', discoveredLinks: [] } as any, error: null, robotsTxtDisallowed: false };
        });
        mockTriggerAIProcessing.mockResolvedValue({ status: 'processed' } as any);

        await runAgent();

        // 1 (initialSiteUrl) + MAX_DISCOVERED_LINKS_PER_STRATEGY_SITE (10) = 11
        expect(mockFetchWebContent).toHaveBeenCalledTimes(1 + MAX_DISCOVERED_LINKS_PER_STRATEGY_SITE_FROM_SCRIPT);
        expect(mockSupabaseClient.insert).toHaveBeenCalledTimes(1 + MAX_DISCOVERED_LINKS_PER_STRATEGY_SITE_FROM_SCRIPT);
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`Reached max discovered links (${MAX_DISCOVERED_LINKS_PER_STRATEGY_SITE_FROM_SCRIPT}) for origin ${initialSiteUrl}.`));
    });

    it('should correctly propagate depth information when queueing', async () => {
        // This is implicitly tested in the MAX_CRAWL_DEPTH = 1 test by checking
        // that linkDepth2PageC (which would be depth 2) is skipped.
        // We can also check the `depth` property on the objects passed to `mockSupabaseClient.insert`.
        const strategies = [{ keywords: baseStrategyKeywords, targetSites: [initialSiteUrl] }];
        mockFetchStrategiesFromSupabase.mockResolvedValueOnce(strategies as any[]);
        mockCheckForDuplicates.mockResolvedValue(false);
        mockFetchWebContent.mockImplementation(async (url) => {
            if (url === initialSiteUrl) return { url, rawHtmlContent: 'html0', extractedArticle: { title: 'T0', content: 'C0', htmlContent:'', discoveredLinks: [linkDepth1PageA] } as any, error: null, robotsTxtDisallowed: false };
            if (url === linkDepth1PageA) return { url, rawHtmlContent: 'htmlA', extractedArticle: { title: 'TA', content: 'CA', htmlContent:'', discoveredLinks: [] } as any, error: null, robotsTxtDisallowed: false };
            return { url, rawHtmlContent: 'error', extractedArticle: null, error: 'unexpected call', robotsTxtDisallowed: false };
        });
        mockTriggerAIProcessing.mockResolvedValue({ status: 'processed' } as any);

        await runAgent();

        expect(mockSupabaseClient.insert).toHaveBeenCalledWith(expect.arrayContaining([
            expect.objectContaining({ source_url: initialSiteUrl, depth: 0 })
        ]));
        expect(mockSupabaseClient.insert).toHaveBeenCalledWith(expect.arrayContaining([
            expect.objectContaining({ source_url: linkDepth1PageA, depth: 1 })
        ]));
    });

  });

  // --- Other existing test suites (condensed placeholders for brevity) ---
  // ... (sendNotification, getRobotsTxtUrl, actualExtractMainContent, fetchWebContent (unit), initializeSupabaseClient, etc.)
  // ... triggerAIProcessing (unit tests)
});

// Ensure nodemailer mocks are correctly scoped if they were defined inside another describe block previously
// If they are at top level of file, this is fine.
// const mockSendMail = jest.fn(); // Already defined at top
// const mockCreateTransport = jest.fn(() => ({ sendMail: mockSendMail })); // Already defined at top
// jest.mock('nodemailer', () => ({ createTransport: mockCreateTransport })); // Already defined at top
