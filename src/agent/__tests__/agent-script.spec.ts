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
import * as aiDev from '../../ai/dev';
const mockTriggerAIProcessing = jest.fn();
jest.mock('../../ai/dev', () => ({
  triggerAIProcessing: mockTriggerAIProcessing,
}));


// Spy on and mock functions from agent-script itself
import * as agentScript from '../agent-script';

const mockInitializeSupabaseClient = jest.spyOn(agentScript, 'initializeSupabaseClient');
const mockFetchStrategiesFromSupabase = jest.spyOn(agentScript, 'fetchStrategiesFromSupabase');
const mockCheckForDuplicates = jest.spyOn(agentScript, 'checkForDuplicates');
const mockFetchWebContent = jest.spyOn(agentScript, 'fetchWebContent');
const mockUpdateSupabaseRecord = jest.spyOn(agentScript, 'updateSupabaseRecord');
const mockSendNotification = jest.spyOn(agentScript, 'sendNotification');
// We will test the actual extractMainContent for links, but for runAgent, fetchWebContent is mocked,
// so extractMainContent calls within fetchWebContent are implicitly part of that mock.
const actualExtractMainContent = agentScript.extractMainContent;


// Import the main function to test
import { runAgent, getRobotsTxtUrl } from '../agent-script';


describe('Agent Script Utilities & Full Orchestration', () => {

  describe('getRobotsTxtUrl', () => {
    it('should return correct robots.txt URL', () => expect(getRobotsTxtUrl('http://example.com')).toBe('http://example.com/robots.txt'));
    it('should handle paths and ports', () => expect(getRobotsTxtUrl('https://test.com:123/path')).toBe('https://test.com:123/robots.txt'));
    it('should throw for invalid URL', () => expect(() => getRobotsTxtUrl('invalid')).toThrow());
  });

  describe('extractMainContent (Actual Implementation Tests)', () => {
    const baseUrl = 'http://example.com';
    it('should extract article details and discovered links from valid HTML', () => {
      const html = `
        <html><head><title>Sample Page Title</title><meta name="author" content="Test Author"></head>
        <body>
          <article><h1>Main Article Title</h1><p>Content with a <a href="/page1">relative link</a>.</p></article>
          <a href="https://othersite.com/page2">absolute external link</a>
          <a href="page3.html">another relative link</a>
          <a href="mailto:test@example.com">mail link</a>
          <a href="ftp://example.com/file.zip">ftp link</a>
          <a href="/page1">duplicate relative link</a>
          <a href="main.css">css link</a>
        </body></html>`;
      const result = actualExtractMainContent(html, baseUrl);

      expect(result).not.toBeNull();
      if (!result) return;
      expect(result.title).toBe('Main Article Title');
      expect(result.byline).toBe('Test Author');
      expect(result.content).toContain('Content with a relative link.');
      expect(result.discoveredLinks).toEqual(expect.arrayContaining([
        'http://example.com/page1',
        'https://othersite.com/page2',
        'http://example.com/page3.html'
      ]));
      expect(result.discoveredLinks).not.toEqual(expect.arrayContaining(['mailto:test@example.com']));
      expect(result.discoveredLinks).not.toEqual(expect.arrayContaining(['ftp://example.com/file.zip']));
      expect(result.discoveredLinks).not.toEqual(expect.arrayContaining(['http://example.com/main.css']));
      // Check for uniqueness (implicitly handled by Set, but good to be sure if test data changes)
      const uniqueLinks = new Set(result.discoveredLinks);
      expect(result.discoveredLinks.length).toBe(uniqueLinks.size);
    });

    it('should return empty discoveredLinks array when no valid links are present', () => {
      const html = `<html><body><p>No links here.</p></body></html>`;
      const result = actualExtractMainContent(html, baseUrl);
      expect(result).not.toBeNull();
      expect(result?.discoveredLinks).toEqual([]);
    });

    it('should return links even if Readability fails to parse an article', () => {
        const htmlWithLinksOnly = `<html><head><title>Links Only</title></head><body><a href="/link1">Link 1</a></body></html>`;
        const result = actualExtractMainContent(htmlWithLinksOnly, baseUrl);
        expect(result).not.toBeNull();
        if(!result) return;
        expect(result.title).toBe('Links Only'); // Fallback to document title
        expect(result.content).toBe('');
        expect(result.discoveredLinks).toEqual(['http://example.com/link1']);
    });
  });

  // fetchWebContent integration tests (condensed as they are not the primary focus of *this* subtask update)
  describe('fetchWebContent (mocked extractMainContent)', () => {
    beforeEach(() => {
        (global.fetch as jest.Mock).mockReset();
        mockIsAllowed.mockReset();
        // For fetchWebContent tests, extractMainContent is typically mocked.
        // If agentScript.extractMainContent is spied on, this mock needs to be correctly managed.
        // For simplicity, if fetchWebContent calls the *actual* extractMainContent, these tests become more complex.
        // The previous setup mocked extractMainContent from '../agent-script' directly.
        // Let's assume for these tests, if fetchWebContent calls the spied `agentScript.extractMainContent`, we mock its return value.
        (agentScript.extractMainContent as jest.MockedFunction<typeof actualExtractMainContent>).mockReturnValue({
             title: 'Mocked Title', content: 'Mocked Content', htmlContent: '', discoveredLinks: []
        } as any);
    });
    it('should successfully fetch if robots allows', async () => {
        (global.fetch as jest.Mock)
            .mockResolvedValueOnce({ ok: true, text: async () => '' } as Response)
            .mockResolvedValueOnce({ ok: true, text: async () => '<html></html>' } as Response);
        mockIsAllowed.mockReturnValue(true);
        const result = await agentScript.fetchWebContent('http://example.com/page'); // Call the spied/actual one
        expect(result.error).toBeUndefined();
        expect(result.rawHtmlContent).toBe('<html></html>');
    });
  });


  describe('Agent Script Orchestration - runAgent', () => {
    const initialSiteUrl1 = 'http://origin.com/page1';
    const initialSiteUrl2 = 'http://anotherorigin.com/start';
    const discoveredLink1FromOrigin1 = 'http://origin.com/discovered1';
    const discoveredLink2FromOrigin1 = 'http://origin.com/discovered2'; // Same domain
    const discoveredLink3OffDomain = 'http://otherdomain.com/offlink';
    const baseStrategyKeywords = ['keywords'];

    beforeEach(() => {
      mockInitializeSupabaseClient.mockClear().mockResolvedValue(mockSupabaseClient as any);
      mockFetchStrategiesFromSupabase.mockClear();
      mockCheckForDuplicates.mockClear();
      mockFetchWebContent.mockClear(); // This is a spy on agentScript.fetchWebContent
      mockTriggerAIProcessing.mockClear();
      mockUpdateSupabaseRecord.mockClear().mockResolvedValue(undefined);
      mockSendNotification.mockClear().mockResolvedValue(undefined);

      mockSupabaseClient.from.mockClear().mockReturnThis();
      mockSupabaseClient.select.mockClear().mockReturnThis();
      mockSupabaseClient.insert.mockClear().mockResolvedValue({ error: null, data: [{ id: 'new-db-id' }] } as any);
      mockSupabaseClient.update.mockClear().mockReturnThis();
      mockSupabaseClient.eq.mockClear().mockReturnThis();

      (global.fetch as jest.Mock).mockReset(); // Reset global fetch for fetchWebContent calls
      mockIsAllowed.mockReset(); // Reset for robots-parser mock used by fetchWebContent
      // Reset the spy on actualExtractMainContent if it's called by actual fetchWebContent
      (agentScript.extractMainContent as jest.MockedFunction<typeof actualExtractMainContent>).mockReset();
    });

    it('should discover and queue new links from a fetched page, respecting domain and limits', async () => {
      const strategies = [{ keywords: baseStrategyKeywords, targetSites: [initialSiteUrl1] }];
      mockFetchStrategiesFromSupabase.mockResolvedValueOnce(strategies as any[]);

      // Initial site: http://origin.com/page1
      mockCheckForDuplicates.mockResolvedValueOnce(false); // initialSiteUrl1 is not in DB
      mockFetchWebContent.mockResolvedValueOnce({ // For initialSiteUrl1
        url: initialSiteUrl1, rawHtmlContent: 'html1',
        extractedArticle: {
          title: 'Title1', content: 'Content1', htmlContent:'',
          discoveredLinks: [discoveredLink1FromOrigin1, discoveredLink2FromOrigin1, discoveredLink3OffDomain, 'http://origin.com/page1'] // last one is self-link
        } as any,
        error: null, robotsTxtDisallowed: false
      });
      mockTriggerAIProcessing.mockResolvedValueOnce({ status: 'processed', title: 'AI Title1' } as any); // For initialSiteUrl1

      // Discovered link 1: http://origin.com/discovered1
      mockCheckForDuplicates.mockResolvedValueOnce(false); // discoveredLink1FromOrigin1 not in DB
      mockFetchWebContent.mockResolvedValueOnce({ // For discoveredLink1FromOrigin1
        url: discoveredLink1FromOrigin1, rawHtmlContent: 'html_disc1',
        extractedArticle: { title: 'Disc1', content: 'ContentDisc1', htmlContent:'', discoveredLinks: [] } as any, // No new links
        error: null, robotsTxtDisallowed: false
      });
      mockTriggerAIProcessing.mockResolvedValueOnce({ status: 'processed', title: 'AI Disc1' } as any); // For discoveredLink1

      // Discovered link 2: http://origin.com/discovered2
      mockCheckForDuplicates.mockResolvedValueOnce(false); // discoveredLink2FromOrigin1 not in DB
      mockFetchWebContent.mockResolvedValueOnce({ // For discoveredLink2FromOrigin1
        url: discoveredLink2FromOrigin1, rawHtmlContent: 'html_disc2',
        extractedArticle: { title: 'Disc2', content: 'ContentDisc2', htmlContent:'', discoveredLinks: [] } as any,
        error: null, robotsTxtDisallowed: false
      });
      mockTriggerAIProcessing.mockResolvedValueOnce({ status: 'processed', title: 'AI Disc2' } as any); // For discoveredLink2

      await runAgent();

      expect(mockFetchStrategiesFromSupabase).toHaveBeenCalledTimes(1);
      // Initial insert for origin.com/page1, d1, d2
      expect(mockSupabaseClient.insert).toHaveBeenCalledTimes(3);
      expect(mockSupabaseClient.insert).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ source_url: initialSiteUrl1, tags: baseStrategyKeywords })]));
      expect(mockSupabaseClient.insert).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ source_url: discoveredLink1FromOrigin1, tags: expect.arrayContaining([...baseStrategyKeywords, 'discovered']) })]));
      expect(mockSupabaseClient.insert).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ source_url: discoveredLink2FromOrigin1, tags: expect.arrayContaining([...baseStrategyKeywords, 'discovered']) })]));

      expect(mockFetchWebContent).toHaveBeenCalledTimes(3);
      expect(mockFetchWebContent).toHaveBeenCalledWith(initialSiteUrl1);
      expect(mockFetchWebContent).toHaveBeenCalledWith(discoveredLink1FromOrigin1);
      expect(mockFetchWebContent).toHaveBeenCalledWith(discoveredLink2FromOrigin1);

      expect(mockTriggerAIProcessing).toHaveBeenCalledTimes(3);
      expect(mockTriggerAIProcessing).toHaveBeenCalledWith(expect.any(String), initialSiteUrl1, baseStrategyKeywords.join(', '));
      expect(mockTriggerAIProcessing).toHaveBeenCalledWith(expect.any(String), discoveredLink1FromOrigin1, baseStrategyKeywords.join(', '));
      expect(mockTriggerAIProcessing).toHaveBeenCalledWith(expect.any(String), discoveredLink2FromOrigin1, baseStrategyKeywords.join(', '));

      // Check that the off-domain link was not processed
      expect(mockFetchWebContent).not.toHaveBeenCalledWith(discoveredLink3OffDomain);
      // Check that updateSupabaseRecord was called multiple times for status updates for each of the 3 URLs
      // Roughly: initial + fetched + extracted + ai_initiated + ai_result = 5 calls per URL * 3 URLs = 15 calls
      expect(mockUpdateSupabaseRecord.mock.calls.length).toBeGreaterThanOrEqual(3 * 4); // At least status updates like fetched, extracted, ai_initiated, ai_successful
    });

    it('should skip discovered link if STAY_ON_SAME_DOMAIN is true and domain differs', async () => {
        const strategies = [{ keywords: baseStrategyKeywords, targetSites: [initialSiteUrl1] }];
        mockFetchStrategiesFromSupabase.mockResolvedValueOnce(strategies as any[]);
        mockCheckForDuplicates.mockResolvedValueOnce(false); // initialSiteUrl1
        mockFetchWebContent.mockResolvedValueOnce({
            url: initialSiteUrl1, rawHtmlContent: 'html1',
            extractedArticle: { title: 'Title1', content: 'Content1', htmlContent:'', discoveredLinks: [discoveredLink3OffDomain] } as any,
            error: null, robotsTxtDisallowed: false
        });
        mockTriggerAIProcessing.mockResolvedValueOnce({ status: 'processed', title: 'AI Title1' } as any);

        await runAgent();
        expect(mockFetchWebContent).toHaveBeenCalledTimes(1); // Only for initialSiteUrl1
        expect(mockFetchWebContent).not.toHaveBeenCalledWith(discoveredLink3OffDomain);
        expect(mockSupabaseClient.insert).toHaveBeenCalledTimes(1); // Only for initialSiteUrl1
    });

    it('should respect MAX_DISCOVERED_LINKS_PER_STRATEGY_SITE', async () => {
        const links = Array.from({ length: 15 }, (_, i) => `http://origin.com/limitlink${i + 1}`);
        // agentScript.MAX_DISCOVERED_LINKS_PER_STRATEGY_SITE is 10 by default in script if not changed by test itself

        const strategies = [{ keywords: baseStrategyKeywords, targetSites: [initialSiteUrl1] }];
        mockFetchStrategiesFromSupabase.mockResolvedValueOnce(strategies as any[]);

        mockCheckForDuplicates.mockReturnValue(false); // All links are new and not in DB

        mockFetchWebContent.mockImplementation(async (url) => {
            if (url === initialSiteUrl1) {
                return { url: initialSiteUrl1, rawHtmlContent: 'html', extractedArticle: { title: 'Initial', content: 'c', htmlContent:'', discoveredLinks: links } as any, error: null, robotsTxtDisallowed: false };
            }
            // For discovered links, return minimal content and no further links
            return { url, rawHtmlContent: 'html_disc', extractedArticle: { title: `Title for ${url}`, content: `c ${url}`, htmlContent:'', discoveredLinks: [] } as any, error: null, robotsTxtDisallowed: false };
        });
        mockTriggerAIProcessing.mockResolvedValue({ status: 'processed' } as any);

        await runAgent();

        // 1 (initial) + 10 (max discovered) = 11 fetches
        expect(mockFetchWebContent).toHaveBeenCalledTimes(1 + 10);
        expect(mockSupabaseClient.insert).toHaveBeenCalledTimes(1 + 10);
    });

    it('should skip discovered link if already in Supabase (checked by checkForDuplicates)', async () => {
        const strategies = [{ keywords: baseStrategyKeywords, targetSites: [initialSiteUrl1] }];
        mockFetchStrategiesFromSupabase.mockResolvedValueOnce(strategies as any[]);

        mockCheckForDuplicates.mockImplementation(async (client, url) => {
            if (url === initialSiteUrl1) return false; // Initial site is not a duplicate
            if (url === discoveredLink1FromOrigin1) return true; // This discovered link IS a duplicate
            return false;
        });

        mockFetchWebContent.mockResolvedValueOnce({ // For initialSiteUrl1
            url: initialSiteUrl1, rawHtmlContent: 'html1',
            extractedArticle: { title: 'Title1', content: 'Content1', htmlContent:'', discoveredLinks: [discoveredLink1FromOrigin1] } as any,
            error: null, robotsTxtDisallowed: false
        });
        mockTriggerAIProcessing.mockResolvedValueOnce({ status: 'processed', title: 'AI Title1' } as any);

        await runAgent();

        expect(mockFetchWebContent).toHaveBeenCalledTimes(1); // Only for initialSiteUrl1
        expect(mockFetchWebContent).not.toHaveBeenCalledWith(discoveredLink1FromOrigin1);
        expect(mockSupabaseClient.insert).toHaveBeenCalledTimes(1); // Only for initialSiteUrl1
        // console.log should have "Skipping discovered link (already in DB): http://origin.com/discovered1"
    });

    it('should skip discovered link if already in globallyProcessedOrQueuedUrlsInThisRun', async () => {
        const strategies = [
            { keywords: ['strat1'], targetSites: [initialSiteUrl1] },
            { keywords: ['strat2'], targetSites: [initialSiteUrl2] } // initialSiteUrl2 will discover initialSiteUrl1
        ];
        mockFetchStrategiesFromSupabase.mockResolvedValueOnce(strategies as any[]);

        // Initial processing for initialSiteUrl1 (from strat1)
        mockCheckForDuplicates.mockResolvedValueOnce(false);
        mockFetchWebContent.mockResolvedValueOnce({
            url: initialSiteUrl1, rawHtmlContent: 'html1',
            extractedArticle: { title: 'Title1', content: 'c1', htmlContent:'', discoveredLinks: [] } as any, // No links from first one for simplicity
            error: null, robotsTxtDisallowed: false
        });
        mockTriggerAIProcessing.mockResolvedValueOnce({ status: 'processed', title: 'AI Title1' } as any);

        // Processing for initialSiteUrl2 (from strat2)
        mockCheckForDuplicates.mockResolvedValueOnce(false);
        mockFetchWebContent.mockResolvedValueOnce({
            url: initialSiteUrl2, rawHtmlContent: 'html2',
            extractedArticle: { title: 'Title2', content: 'c2', htmlContent:'', discoveredLinks: [initialSiteUrl1] } as any, // Discovers initialSiteUrl1
            error: null, robotsTxtDisallowed: false
        });
        mockTriggerAIProcessing.mockResolvedValueOnce({ status: 'processed', title: 'AI Title2' } as any);

        // No more calls to checkForDuplicates, fetchWebContent, or triggerAIProcessing for initialSiteUrl1 when discovered by initialSiteUrl2

        await runAgent();

        expect(mockFetchWebContent).toHaveBeenCalledTimes(2); // Once for initialSiteUrl1, once for initialSiteUrl2
        expect(mockFetchWebContent).toHaveBeenCalledWith(initialSiteUrl1);
        expect(mockFetchWebContent).toHaveBeenCalledWith(initialSiteUrl2);
        expect(mockSupabaseClient.insert).toHaveBeenCalledTimes(2); // For initialSiteUrl1 and initialSiteUrl2
         // console.log should have "Skipping link (already processed/queued globally in this run): http://origin.com/page1"
    });

  });
});
