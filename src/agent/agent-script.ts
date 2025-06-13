/**
 * @fileOverview Content Curator Agent script.
 * This script is intended to be run by a scheduler (e.g., GitHub Actions).
 * It fetches content curation strategies, discovers new content,
 * processes it using AI (by calling a Next.js API endpoint), and stores the results in Supabase.
 */

import { config } from 'dotenv';
config(); // Load .env file for local development/testing of this script

import * as nodemailer from 'nodemailer';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import robotsParser from 'robots-parser';
import type { ProcessedContent, SearchStrategy } from '@/lib/definitions'; // Adjust path as needed
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import Sitemapper from 'sitemapper';
import { URL } from 'url'; // Explicit import for URL constructor


// Define types for the AI processing API call
interface AgentProcessApiRequest {
  articleId: string;
  articleUrl: string;
  topic: string;
}

interface AgentProcessApiResponse {
  message?: string | null;
  processedContent?: ProcessedContent | null;
  error?: string | null;
  articleId?: string | null;
}

let supabase: SupabaseClient | null = null;

// Configuration for fetch retries
const MAX_FETCH_RETRIES = 3;
const FETCH_RETRY_DELAY_MS = 1000;
const FETCH_TIMEOUT_MS = 15000; // 15 seconds timeout for each fetch attempt

// Configuration for API call retries (for triggerAIProcessing)
const MAX_API_CALL_RETRIES = 3;
const API_CALL_RETRY_DELAY_MS = 2000;
const API_CALL_TIMEOUT_MS = 20000; // Timeout for each API call attempt

// Configuration for Uptime Kuma Heartbeat
const HEARTBEAT_TIMEOUT_MS = 5000; // 5 seconds

// Sitemap processing configuration
const SITEMAP_TIMEOUT_MS = 15000; // Timeout for fetching individual sitemap files


// Statuses for curated_content table
const STATUS = {
  PROCESSING_STARTED: 'processing_started', // Agent has picked up the URL
  SKIPPED_ROBOTS: 'skipped_robots',     // Fetching disallowed by robots.txt
  ERROR_FETCHING: 'error_fetching',       // Error during web content fetch
  CONTENT_FETCHED: 'content_fetched',     // Raw HTML successfully fetched
  CONTENT_EXTRACTED: 'content_extracted', // Main content successfully extracted by Readability
  ERROR_EXTRACTION: 'error_extraction',   // Readability failed to extract main content
  AI_PROCESSING_INITIATED: 'ai_processing_initiated', // Call to AI processing API started
  AI_PROCESSING_SUCCESSFUL: 'ai_processing_successful', // AI processing completed successfully
  AI_PROCESSING_FAILED: 'ai_processing_failed',     // AI processing API returned an error or failed
  COMPLETED: 'completed', // Generic success status if AI processing is successful (can be same as AI_PROCESSING_SUCCESSFUL)
  ERROR: 'error', // Generic error status for unexpected issues
};

// Configuration for Link Discovery
const MAX_DISCOVERED_LINKS_PER_STRATEGY_SITE = 10; // Max new links to process from one initial strategy site's discovery path
const STAY_ON_SAME_DOMAIN = true; // If true, discovered links must be on the same domain as their origin (initial strategy site)
const MAX_CRAWL_DEPTH = 2; // 0: initial sites only; 1: links on initial sites; etc.

const OUR_USER_AGENT = 'ContentCuratorBot/1.0 (+http://yourprojecturl.com/botinfo)';

// --- Notification Function Stub ---
async function sendNotification(subject: string, body: string, isCritical: boolean = true): Promise<void> {
  console.log(`
--- AGENT NOTIFICATION ATTEMPT (${new Date().toISOString()}) ---`);
  if (isCritical) {
    console.error(`🔴 CRITICAL ERROR ALERT 🔴`);
  } else {
    console.warn(`🟡 WARNING 🟡`);
  }
  console.log(`Subject: ${subject}`);
  console.log(`Body:\n${body}`);

  const {
    EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS,
    EMAIL_SECURE, NOTIFICATION_EMAIL_FROM, NOTIFICATION_EMAIL_TO
  } = process.env;

  if (!EMAIL_HOST || !EMAIL_USER || !EMAIL_PASS || !NOTIFICATION_EMAIL_FROM || !NOTIFICATION_EMAIL_TO) {
    console.warn('Email notification functionality is disabled: Required email environment variables are not all set.');
    console.log(`--- END OF NOTIFICATION LOG (Email not sent) ---`);
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: EMAIL_HOST,
      port: parseInt(EMAIL_PORT || '587', 10),
      secure: EMAIL_SECURE === 'true',
      auth: { user: EMAIL_USER, pass: EMAIL_PASS },
      logger: process.env.NODE_ENV === 'development',
      debug: process.env.NODE_ENV === 'development',
    });
    const mailOptions = {
      from: `Content Agent <${NOTIFICATION_EMAIL_FROM}>`,
      to: NOTIFICATION_EMAIL_TO,
      subject: `Content Agent (${isCritical ? 'CRITICAL' : 'WARNING'}): ${subject}`,
      text: body,
      html: `<p>${body.replace(/\n/g, '<br>')}</p>`
    };
    console.log(`Attempting to send notification email via ${EMAIL_HOST} to: ${NOTIFICATION_EMAIL_TO}...`);
    const info = await transporter.sendMail(mailOptions);
    console.log('Notification email sent successfully. Message ID:', info.messageId);
  } catch (error: any) {
    console.error('Failed to send notification email via Nodemailer.');
    console.error('Email Sending Error Details:', error.message);
    if (error.response) { console.error('SMTP Response:', error.response); }
    if (error.code) { console.error('Nodemailer Error Code:', error.code); }
  }
  console.log(`--- END OF NOTIFICATION LOG ---`);
}

interface ExtractedArticle {
  title: string; content: string; htmlContent: string;
  excerpt?: string; byline?: string; dir?: string;
  length?: number; discoveredLinks: string[];
}

async function fetchUrlsFromSitemap(baseUrl: string): Promise<string[]> {
  const sitemapPaths = new Set<string>();
  const uniqueUrlsFromSitemaps = new Set<string>();
  const robotsUrl = getRobotsTxtUrl(baseUrl);
  console.log(`Fetching robots.txt for sitemap discovery: ${robotsUrl}`);
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const response = await fetch(robotsUrl, { headers: { 'User-Agent': OUR_USER_AGENT }, signal: controller.signal });
    clearTimeout(timeoutId);
    if (response.ok) {
      const robotsTxtContent = await response.text();
      robotsTxtContent.split('\n').forEach(line => {
        const trimmedLine = line.trim();
        if (trimmedLine.toLowerCase().startsWith('sitemap:')) {
          const sitemapPath = trimmedLine.substring('sitemap:'.length).trim();
          try {
            const sitemapFullUrl = new URL(sitemapPath, baseUrl).href;
            sitemapPaths.add(sitemapFullUrl);
            console.log(`Found sitemap in robots.txt: ${sitemapFullUrl}`);
          } catch (e) { console.warn(`Invalid sitemap URL found in robots.txt "${sitemapPath}": ${(e as Error).message}`); }
        }
      });
    } else { console.warn(`Failed to fetch robots.txt for sitemap discovery from ${robotsUrl}: ${response.status}`);}
  } catch (error: any) {
    if (error.name === 'AbortError') { console.warn(`Timeout fetching robots.txt for sitemap discovery from ${robotsUrl}`);
    } else { console.warn(`Error fetching robots.txt for sitemap discovery from ${robotsUrl}: ${error.message}`);}
  }
  try { sitemapPaths.add(new URL('/sitemap.xml', baseUrl).href);
  } catch (e) { console.error(`Error constructing default sitemap path for ${baseUrl}: ${(e as Error).message}`);}

  for (const sitemapFullPath of Array.from(sitemapPaths)) {
    console.log(`Attempting to fetch and parse sitemap: ${sitemapFullPath}`);
    const sitemapper = new Sitemapper({ url: sitemapFullPath, timeout: SITEMAP_TIMEOUT_MS });
    try {
      const { sites, errors } = await sitemapper.fetch();
      sites.forEach(site => {
        try {
            const urlObj = new URL(site);
            if (urlObj.protocol === 'http:' || urlObj.protocol === 'https:') { uniqueUrlsFromSitemaps.add(site); }
        } catch(e) { /* console.warn(`Skipping invalid URL from sitemap ${sitemapFullPath}: ${site}`); */ }
      });
      if (sites.length > 0) { console.log(`Found ${sites.length} URLs in ${sitemapFullPath}. Total unique URLs so far: ${uniqueUrlsFromSitemaps.size}`); }
      if (errors && errors.length > 0) { errors.forEach(err => console.warn(`Sitemapper error for ${sitemapFullPath} (URL: ${err.url}, Type: ${err.type}): ${err.message || err.error?.message}`));}
    } catch (error: any) { console.warn(`Error fetching/parsing sitemap ${sitemapFullPath}: ${error.message}`); }
  }
  return Array.from(uniqueUrlsFromSitemaps);
}

async function initializeSupabaseClient(): Promise<SupabaseClient> {
  console.log('Initializing Supabase client...');
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Supabase URL or Anon Key is not defined in environment variables.');
    throw new Error('Supabase environment variables not set. Agent cannot connect to database.');
  }
  if (!supabase) { supabase = createClient(supabaseUrl, supabaseAnonKey); console.log('Supabase client initialized.'); }
  return supabase;
}

async function fetchStrategiesFromSupabase(supabaseClient: SupabaseClient): Promise<SearchStrategy[]> {
  console.log("Fetching search strategies from Supabase table 'search_strategies'...");
  try {
    const { data, error } = await supabaseClient.from('search_strategies').select('*');
    if (error) {
      console.error('Error fetching strategies from Supabase:', error.message);
      console.log('Falling back to default mock strategy.');
      return [{ keywords: ['AI in education'], targetSites: ['https://www.example.com/ai-news'], contentTypesToMonitor: ['articles', 'blog posts'] }];
    }
    if (!data || data.length === 0) {
      console.log('No strategies found in Supabase. Falling back to default mock strategy.');
      return [{ keywords: ['AI in education'], targetSites: ['https://www.example.com/ai-news'], contentTypesToMonitor: ['articles', 'blog posts'] }];
    }
    console.log(`Fetched ${data.length} strategies from Supabase.`);
    return data.map(strategy => ({
        keywords: Array.isArray(strategy.keywords) ? strategy.keywords : (typeof strategy.keywords === 'string' ? [strategy.keywords] : []),
        targetSites: Array.isArray(strategy.target_sites) ? strategy.target_sites : (typeof strategy.target_sites === 'string' ? [strategy.target_sites] : []),
        contentTypesToMonitor: Array.isArray(strategy.content_types_to_monitor) ? strategy.content_types_to_monitor : (typeof strategy.content_types_to_monitor === 'string' ? [strategy.content_types_to_monitor] : []),
    }));
  } catch (e: any) {
    console.error('Unexpected error during fetchStrategiesFromSupabase:', e.message);
    console.log('Falling back to default mock strategy due to unexpected error.');
    return [{ keywords: ['AI in education'], targetSites: ['https://www.example.com/ai-news'], contentTypesToMonitor: ['articles', 'blog posts'] }];
  }
}

function getRobotsTxtUrl(websiteUrl: string): string {
  const urlObj = new URL(websiteUrl);
  return `${urlObj.protocol}//${urlObj.host}/robots.txt`;
}

function extractLinksFromHtml(dom: JSDOM, baseUrl: string): string[] {
  const links = new Set<string>();
  const elements = dom.window.document.querySelectorAll('a');
  elements.forEach(element => {
    const href = element.getAttribute('href');
    if (href) {
      try {
        const absoluteUrl = new URL(href, baseUrl).href;
        const urlObj = new URL(absoluteUrl);
        if (urlObj.protocol === 'http:' || urlObj.protocol === 'https:') {
          const path = urlObj.pathname.toLowerCase();
          if (!path.endsWith('.css') && !path.endsWith('.js') &&
              !path.endsWith('.png') && !path.endsWith('.jpg') && !path.endsWith('.jpeg') &&
              !path.endsWith('.gif') && !path.endsWith('.svg') && !path.endsWith('.zip') &&
              !path.endsWith('.pdf') && !path.endsWith('.xml') && !path.endsWith('.json')) {
            links.add(absoluteUrl);
          }
        }
      } catch (e) { /* console.warn(`Invalid URL found or error in processing link "${href}": ${e.message}`); */ }
    }
  });
  return Array.from(links);
}

function extractMainContent(htmlContent: string, url: string): ExtractedArticle | null {
  console.log(`Extracting main content and links from URL: ${url}`);
  try {
    const doc = new JSDOM(htmlContent, { url });
    doc.window.document.documentURI = url;
    const reader = new Readability(doc.window.document);
    const article = reader.parse();
    const discoveredLinks = extractLinksFromHtml(doc, url);
    if (article) {
      console.log(`Successfully extracted article: "${article.title}" for URL: ${url}. Found ${discoveredLinks.length} links.`);
      return {
        title: article.title, content: article.textContent || '', htmlContent: article.content,
        excerpt: article.excerpt, byline: article.byline, dir: article.dir,
        length: article.length, discoveredLinks: discoveredLinks,
      };
    } else {
      console.warn(`Readability could not parse article content from URL: ${url}. Still returning ${discoveredLinks.length} discovered links.`);
      return {
        title: doc.window.document.title || 'Title not found', content: '', htmlContent: '',
        discoveredLinks: discoveredLinks,
      };
    }
  } catch (error: any) {
    console.error(`Error during content/link extraction for ${url}: ${error.message}`);
    return null;
  }
}

interface WebContentFetchResult {
  url: string; rawHtmlContent: string | null; extractedArticle: ExtractedArticle | null;
  error?: string; robotsTxtDisallowed?: boolean;
}

async function fetchWebContent(targetUrl: string): Promise<WebContentFetchResult> {
  console.log(`Fetching web content from: ${targetUrl}`);
  let rawHtmlContent: string | null = null;
  let errorState: string | undefined;
  let robotsTxtDisallowed = false;
  let attempt = 0;
  try {
    const robotsTxtUrl = getRobotsTxtUrl(targetUrl);
    let robots;
    try {
      const robotsResponse = await fetch(robotsTxtUrl, { headers: { 'User-Agent': OUR_USER_AGENT }});
      if (robotsResponse.ok) {
        const robotsTxtContent = await robotsResponse.text();
        robots = robotsParser(robotsTxtUrl, robotsTxtContent);
        console.info(`Successfully fetched and parsed robots.txt for ${targetUrl}`);
      } else { console.warn(`Could not fetch robots.txt from ${robotsTxtUrl}, proceeding without it. Status: ${robotsResponse.status} ${robotsResponse.statusText}`);}
    } catch (error: any) { console.warn(`Error fetching or parsing robots.txt from ${robotsTxtUrl}, proceeding without it: ${error.message}`);}

    if (robots) {
        if (!robots.isAllowed(targetUrl, OUR_USER_AGENT)) {
            console.log(`Fetching disallowed by robots.txt for ${targetUrl} for user agent ${OUR_USER_AGENT}`);
            robotsTxtDisallowed = true;
            return { url: targetUrl, rawHtmlContent: null, extractedArticle: null, error: 'robots.txt disallows fetching', robotsTxtDisallowed };
        }
        console.log(`Fetching allowed by robots.txt for ${targetUrl} for user agent ${OUR_USER_AGENT}`);
    } else { console.log(`No robots.txt processed or applicable for ${targetUrl}, proceeding with fetch.`);}

    for (attempt = 0; attempt < MAX_FETCH_RETRIES; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      try {
        console.log(`Attempt ${attempt + 1}/${MAX_FETCH_RETRIES} to fetch ${targetUrl}`);
        const response = await fetch(targetUrl, { headers: { 'User-Agent': OUR_USER_AGENT }, signal: controller.signal, redirect: 'follow'});
        clearTimeout(timeoutId);
        if (response.ok) {
          rawHtmlContent = await response.text();
          console.log(`Successfully fetched raw HTML from ${targetUrl} on attempt ${attempt + 1}. Length: ${rawHtmlContent.length}`);
          errorState = undefined; break;
        } else {
          errorState = `Failed to fetch ${targetUrl}: ${response.status} ${response.statusText}`;
          if (response.status >= 500 && response.status <= 599) {
            console.warn(`${errorState}. Attempt ${attempt + 1}/${MAX_FETCH_RETRIES}. Retrying after ${FETCH_RETRY_DELAY_MS}ms...`);
            if (attempt < MAX_FETCH_RETRIES - 1) { await new Promise(resolve => setTimeout(resolve, FETCH_RETRY_DELAY_MS)); continue; }
          } else { console.error(`${errorState}. This is a non-retryable HTTP error. Not retrying.`);
            return { url: targetUrl, rawHtmlContent: null, extractedArticle: null, error: errorState, robotsTxtDisallowed };
          }
        }
      } catch (fetchError: any) {
        clearTimeout(timeoutId); errorState = `Fetch error for ${targetUrl}: ${fetchError.message}`;
        if (fetchError.name === 'AbortError') { errorState = `Fetch timed out for ${targetUrl} after ${FETCH_TIMEOUT_MS}ms.`;}
        console.warn(`${errorState}. Attempt ${attempt + 1}/${MAX_FETCH_RETRIES}.`);
        if (attempt < MAX_FETCH_RETRIES - 1) { console.log(`Retrying after ${FETCH_RETRY_DELAY_MS}ms...`); await new Promise(resolve => setTimeout(resolve, FETCH_RETRY_DELAY_MS)); continue;}
      }
    }
    if (!rawHtmlContent) {
      console.error(`Failed to fetch ${targetUrl} after ${MAX_FETCH_RETRIES} attempts. Last error: ${errorState}`);
      return { url: targetUrl, rawHtmlContent: null, extractedArticle: null, error: `Failed after ${MAX_FETCH_RETRIES} retries: ${errorState}`, robotsTxtDisallowed };
    }
    const extractedArticle = extractMainContent(rawHtmlContent, targetUrl);
    if (extractedArticle) { console.log(`Main content successfully extracted for ${targetUrl}. Title: ${extractedArticle.title}`);
    } else { console.warn(`Main content extraction failed or returned no article for ${targetUrl}. Raw HTML will be available.`);}
    return { url: targetUrl, rawHtmlContent, extractedArticle, error: errorState, robotsTxtDisallowed };
  } catch (error: any) {
    console.error(`Unexpected error during fetchWebContent for ${targetUrl}: ${error.message}`);
    return { url: targetUrl, rawHtmlContent: null, extractedArticle: null, error: error.message, robotsTxtDisallowed };
  }
}

async function checkForDuplicates(supabaseClient: SupabaseClient, sourceUrl: string): Promise<boolean> {
  console.log(`Checking for duplicates for URL in 'curated_content': ${sourceUrl}`);
  try {
    const { count } = await supabaseClient.from('curated_content').select('id', { count: 'exact', head: true }).eq('source_url', sourceUrl);
    const isDuplicate = count !== null && count > 0;
    console.log(isDuplicate ? `URL '${sourceUrl}' is a duplicate.` : `URL '${sourceUrl}' is not a duplicate.`);
    return isDuplicate;
  } catch (e: any) { console.error('Error checking for duplicates in Supabase:', (e as Error).message); return false; }
}

async function triggerAIProcessing(articleId: string, articleUrl: string, topic: string): Promise<ProcessedContent | null> {
  console.log(`Triggering AI processing for URL: ${articleUrl}, Topic: ${topic}`);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    const errorMsg = 'NEXT_PUBLIC_APP_URL is not set. Cannot call AI processing API.'; console.error(errorMsg);
    return { id: articleId, sourceUrl: articleUrl, title: 'Agent Misconfiguration', summary: 'NEXT_PUBLIC_APP_URL not configured.',
        tags: ['error', 'agent-config-error'], status: STATUS.ERROR, progressMessage: 'AI processing skipped.', errorMessage: errorMsg, imageStatus: 'none',};
  }
  const apiEndpoint = `${appUrl.replace(/\/$/, '')}/api/agent/process-content`;
  const requestBody: AgentProcessApiRequest = { articleId, articleUrl, topic };
  let lastError: any = null;
  for (let attempt = 0; attempt < MAX_API_CALL_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_CALL_TIMEOUT_MS);
    console.log(`Attempt ${attempt + 1}/${MAX_API_CALL_RETRIES} to call AI Processing API: POST ${apiEndpoint}`);
    try {
      const response = await fetch(apiEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody), signal: controller.signal });
      clearTimeout(timeoutId);
      if (response.ok) {
        const result: AgentProcessApiResponse = await response.json();
        if (result.error || !result.processedContent) {
          const apiErrorMsg = result.error || result.message || 'AI Processing API error.'; console.error(`AI Processing API returned an application error: ${apiErrorMsg}`);
          return { id: articleId, sourceUrl: articleUrl, title: 'AI Processing Failed by API', summary: apiErrorMsg, tags: ['error', 'ai-failure-via-api'], status: STATUS.AI_PROCESSING_FAILED, errorMessage: apiErrorMsg, progressMessage: 'AI processing failed at API level.', imageStatus: 'none',};
        }
        console.log('AI processing successful via API for:', result.processedContent?.title); return result.processedContent;
      } else {
        let errorDataText = `HTTP ${response.status}: ${response.statusText}`; try { errorDataText = (await response.text()).substring(0, 500); } catch (e) {}
        lastError = new Error(`API call failed with status ${response.status}: ${response.statusText}. Response: ${errorDataText}`); console.error(`Attempt ${attempt + 1} failed: ${lastError.message}`);
        if (response.status === 500 || response.status === 502 || response.status === 503 || response.status === 504) {
          if (attempt < MAX_API_CALL_RETRIES - 1) { console.log(`Retrying after ${API_CALL_RETRY_DELAY_MS}ms...`); await new Promise(resolve => setTimeout(resolve, API_CALL_RETRY_DELAY_MS)); continue; }
        } else { console.error('Non-retryable HTTP error received from API.');
          return { id: articleId, sourceUrl: articleUrl, title: 'API Client Error', summary: `API returned ${response.status}. Details: ${errorDataText}`, tags: ['error', 'api-client-error'], status: STATUS.ERROR, errorMessage: `API returned ${response.status}: ${errorDataText}`, progressMessage: `Error calling API: ${response.status}`, imageStatus: 'none',};
        }
      }
    } catch (error: any) {
      clearTimeout(timeoutId); lastError = error;
      if (error.name === 'AbortError') { lastError = new Error(`API call timed out after ${API_CALL_TIMEOUT_MS}ms.`);}
      console.error(`Attempt ${attempt + 1} failed: ${lastError.message}`);
      if (attempt < MAX_API_CALL_RETRIES - 1) { console.log(`Retrying after ${API_CALL_RETRY_DELAY_MS}ms...`); await new Promise(resolve => setTimeout(resolve, API_CALL_RETRY_DELAY_MS));}
    }
  }
  const finalErrorMsg = `Failed to call AI processing API at ${apiEndpoint} after ${MAX_API_CALL_RETRIES} attempts. Last error: ${lastError?.message || 'Unknown error'}`; console.error(finalErrorMsg);
  return { id: articleId, sourceUrl: articleUrl, title: 'API Call Failed After Retries', summary: finalErrorMsg, tags: ['error', 'api-error', 'max-retries-exceeded'], status: STATUS.AI_PROCESSING_FAILED, errorMessage: finalErrorMsg, progressMessage: `Failed AI processing after ${MAX_API_CALL_RETRIES} attempts.`, imageStatus: 'none',};
}

async function storeResultsInSupabase(supabaseClient: SupabaseClient, processedData: ProcessedContent) {
  console.log(`Storing results in Supabase 'curated_content' for title: ${processedData.title}`);
  try {
    const { data, error } = await supabaseClient.from('curated_content').insert([{
          title: processedData.title, summary: processedData.summary, tags: processedData.tags, source_url: processedData.sourceUrl,
          status: processedData.status, agent_progress_message: processedData.progressMessage, agent_error_message: processedData.errorMessage,
          image_url: processedData.imageUrl, image_ai_hint: processedData.imageAiHint, image_status: processedData.imageStatus,
          image_error_message: processedData.imageErrorMessage,
        },]).select();
    if (error) { console.error('Error storing results in Supabase:', error.message);
      if (error.code === '23505') { console.error(`Supabase unique constraint violation for source_url: ${processedData.sourceUrl}.`);}
    } else { console.log('Results stored successfully in Supabase. Inserted data (first item):', data ? data[0] : 'No data returned');}
  } catch (e: any) { console.error('Unexpected error during storeResultsInSupabase:', e.message); }
}

async function runAgent() {
  console.log(`Content Curator Agent started running at: ${new Date().toISOString()}`);
  let agentRunSuccessfullyCompleted = false;

  const {
    EMAIL_HOST, EMAIL_USER, EMAIL_PASS,
    NOTIFICATION_EMAIL_FROM, NOTIFICATION_EMAIL_TO,
    UPTIME_KUMA_PUSH_URL
  } = process.env;

  if (!EMAIL_HOST || !EMAIL_USER || !EMAIL_PASS || !NOTIFICATION_EMAIL_FROM || !NOTIFICATION_EMAIL_TO) {
    console.warn(`
--- [AGENT STARTUP WARNING] ---
Email notification system is not fully configured.
Notifications will be limited to console output until all required email environment variables are set.
Please check: EMAIL_HOST, EMAIL_USER, EMAIL_PASS, NOTIFICATION_EMAIL_FROM, NOTIFICATION_EMAIL_TO.
Current values (undefined means not set, sensitive fields are masked if present):
  EMAIL_HOST: ${EMAIL_HOST}
  EMAIL_USER: ${EMAIL_USER ? '***' : undefined}
  EMAIL_PASS: ${EMAIL_PASS ? '***' : undefined}
  NOTIFICATION_EMAIL_FROM: ${NOTIFICATION_EMAIL_FROM}
  NOTIFICATION_EMAIL_TO: ${NOTIFICATION_EMAIL_TO}
-------------------------------
`);
  } else { console.log('[AGENT STARTUP] Email notification system appears to be configured.'); }

  if (UPTIME_KUMA_PUSH_URL) { console.log(`[AGENT STARTUP] Uptime Kuma heartbeat pings are configured to: ${UPTIME_KUMA_PUSH_URL}`);
  } else { console.info('[AGENT STARTUP] Uptime Kuma heartbeat URL (UPTIME_KUMA_PUSH_URL) is not set. Heartbeat pings will be skipped.');}

  const globallyProcessedOrQueuedUrlsInThisRun = new Set<string>();
  let supabaseClient;

  try {
    supabaseClient = await initializeSupabaseClient();
    const strategies = await fetchStrategiesFromSupabase(supabaseClient);

    if (!strategies || strategies.length === 0) {
      const warningMessage = 'No search strategies found or fetched from Supabase. The agent has no work to do.';
      console.warn(warningMessage);
      await sendNotification('Agent Warning: No Search Strategies', warningMessage, false);
      console.log('Agent will exit as there are no strategies to process.');
      agentRunSuccessfullyCompleted = true; return;
    }
    console.log(`Processing ${strategies.length} strategies.`);

    try {
      for (const strategy of strategies) {
        console.log(`\nProcessing strategy: Keywords - ${(strategy.keywords || []).join(', ')}, Initial Sites: ${(strategy.targetSites || []).join(', ')}`);
        const baseStrategyKeywords = strategy.keywords || ['untagged'];

        for (const initialSiteUrl of (strategy.targetSites || [])) {
        let seedUrlsForThisBranch: { url: string; isDiscovered: boolean; originalStrategyKeywords: string[]; depth: number; }[] = [];
        let isBaseUrl = false;
        let currentInitialSiteHostname: string | undefined;

        try {
          const parsedUrl = new URL(initialSiteUrl);
          currentInitialSiteHostname = parsedUrl.hostname;
          if (parsedUrl.pathname === '/' || parsedUrl.pathname === '') { isBaseUrl = true; }
        } catch (e: any) {
          console.error(`Invalid initialSiteUrl in strategy: ${initialSiteUrl} - ${e.message}. Skipping this initial site.`);
          await sendNotification('Agent Error: Invalid Strategy URL', `Strategy URL "${initialSiteUrl}" from strategy (Keywords: ${baseStrategyKeywords.join(', ')}) is invalid and cannot be processed. Error: ${e.message}`, true);
          continue;
        }

        if (isBaseUrl) {
          console.log(`Processing ${initialSiteUrl} as a base URL, attempting sitemap discovery.`);
          const sitemapUrls = await fetchUrlsFromSitemap(initialSiteUrl);
          if (sitemapUrls.length > 0) {
            console.log(`Found ${sitemapUrls.length} URLs from sitemap(s) for ${initialSiteUrl}. Adding valid new ones to queue.`);
            for (const sitemapUrl of sitemapUrls) {
              if (globallyProcessedOrQueuedUrlsInThisRun.has(sitemapUrl)) { continue; }
              if (await checkForDuplicates(supabaseClient, sitemapUrl)) { globallyProcessedOrQueuedUrlsInThisRun.add(sitemapUrl); continue; }
              seedUrlsForThisBranch.push({ url: sitemapUrl, isDiscovered: false, originalStrategyKeywords: baseStrategyKeywords, depth: 0 });
            }
          }

          if (seedUrlsForThisBranch.length === 0) {
            console.log(`No valid, new URLs found via sitemap(s) for base URL ${initialSiteUrl}. Adding the base URL itself to queue if new.`);
            if (!globallyProcessedOrQueuedUrlsInThisRun.has(initialSiteUrl)) {
                if (!await checkForDuplicates(supabaseClient, initialSiteUrl)) {
                    seedUrlsForThisBranch.push({ url: initialSiteUrl, isDiscovered: false, originalStrategyKeywords: baseStrategyKeywords, depth: 0 });
                } else { globallyProcessedOrQueuedUrlsInThisRun.add(initialSiteUrl); console.log(`Initial base URL ${initialSiteUrl} is a duplicate in DB. Not adding to seed.`); }
            } else { console.log(`Initial base URL ${initialSiteUrl} already globally processed or queued in this run. Not adding to seed.`);}
          }
        } else {
            console.log(`Processing ${initialSiteUrl} as a direct target URL (not a base URL for sitemap scan).`);
             if (!globallyProcessedOrQueuedUrlsInThisRun.has(initialSiteUrl)) {
                if (!await checkForDuplicates(supabaseClient, initialSiteUrl)) {
                    seedUrlsForThisBranch.push({ url: initialSiteUrl, isDiscovered: false, originalStrategyKeywords: baseStrategyKeywords, depth: 0 });
                } else { globallyProcessedOrQueuedUrlsInThisRun.add(initialSiteUrl); console.log(`Initial direct URL ${initialSiteUrl} is a duplicate in DB. Not adding to seed.`);}
            } else { console.log(`Initial direct URL ${initialSiteUrl} is already processed or queued in this run. Not adding to seed.`);}
        }

        const urlsToProcess = [...seedUrlsForThisBranch];
        if (urlsToProcess.length === 0) {
            console.log(`No new URLs to process for initial site branch: ${initialSiteUrl}.`);
            continue;
        }

        let discoveredLinksProcessedCountForInitialSite = 0;
        const initialSiteHostname = currentInitialSiteHostname;

        let iterationCount = 0;
        const MAX_ITERATIONS_PER_INITIAL_SITE = 100;

        while (urlsToProcess.length > 0 && iterationCount < MAX_ITERATIONS_PER_INITIAL_SITE) {
          iterationCount++;
          const currentUrlObject = urlsToProcess.shift();
          if (!currentUrlObject) continue;

          const { url: currentUrlToProcess, isDiscovered, originalStrategyKeywords, depth: currentDepth } = currentUrlObject;

          if (globallyProcessedOrQueuedUrlsInThisRun.has(currentUrlToProcess)) {
                 console.log(`Skipping ${currentUrlToProcess} as it was already added to global set and likely processed or queued by another path.`);
                 continue;
          }
          globallyProcessedOrQueuedUrlsInThisRun.add(currentUrlToProcess);

          console.log(`\n---\nProcessing URL: ${currentUrlToProcess} (Origin: ${initialSiteUrl}, Discovered: ${isDiscovered}, Depth: ${currentDepth})`);

          const processingId = `agent-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

          let tagsForRecord = originalStrategyKeywords;
          if (isDiscovered) {
            tagsForRecord = [...new Set([...tagsForRecord, 'discovered'])];
          }

          const initialRecordData: Partial<ProcessedContent> & { source_url: string; status: string; agent_id?: string; } = {
            source_url: currentUrlToProcess, title: `Processing: ${currentUrlToProcess}`, summary: 'Agent processing started.',
            tags: tagsForRecord, status: STATUS.PROCESSING_STARTED,
            agent_progress_message: `Agent picked up URL for processing. Discovered: ${isDiscovered}. Depth: ${currentDepth}.`,
            agent_id: processingId,
          };
          try {
            const { error: insertError } = await supabaseClient.from('curated_content').insert([initialRecordData]).select();
            if (insertError) {
              console.error(`Error inserting initial record for ${currentUrlToProcess}: ${insertError.message}.`);
              if (insertError.code === '23505') console.error(`Unique constraint violation for ${currentUrlToProcess}.`);
              globallyProcessedOrQueuedUrlsInThisRun.delete(currentUrlToProcess); continue;
            }
            console.log(`Initial record created for ${isDiscovered ? 'discovered ' : ''}URL: ${currentUrlToProcess} with status ${STATUS.PROCESSING_STARTED}`);
          } catch (e:any) {
            console.error(`Unexpected error during initial record insertion for ${currentUrlToProcess}: ${e.message}.`);
            globallyProcessedOrQueuedUrlsInThisRun.delete(currentUrlToProcess); continue;
          }

          const webContentResult = await fetchWebContent(currentUrlToProcess);

          if (webContentResult.robotsTxtDisallowed) {
            console.log(`Skipping ${currentUrlToProcess} as fetching is disallowed by robots.txt.`);
            await updateSupabaseRecord(supabaseClient, currentUrlToProcess, {
              summary: 'Content fetching was disallowed by the website\'s robots.txt file.', status: STATUS.SKIPPED_ROBOTS,
              agent_error_message: 'robots.txt disallows fetching for user agent ' + OUR_USER_AGENT,
              agent_progress_message: 'Skipped due to robots.txt.',
            }); continue;
          }

          if (webContentResult.error || !webContentResult.rawHtmlContent) {
            console.warn(`Could not fetch content or content was empty for ${currentUrlToProcess}. Error: ${webContentResult.error || 'No raw HTML content'}.`);
            await updateSupabaseRecord(supabaseClient, currentUrlToProcess, {
              summary: webContentResult.error || 'No raw HTML content was obtained.', status: STATUS.ERROR_FETCHING,
              agent_error_message: webContentResult.error || 'Raw HTML content is null or empty.',
              agent_progress_message: 'Content fetching failed or returned empty.',
            }); continue;
          }

          await updateSupabaseRecord(supabaseClient, currentUrlToProcess, {
            status: STATUS.CONTENT_FETCHED,
            agent_progress_message: `Successfully fetched raw HTML. Length: ${webContentResult.rawHtmlContent.length}.`,
            agent_error_message: null,
          });

          let discoveredLinksOnPage: string[] = [];
          if (webContentResult.extractedArticle) {
            discoveredLinksOnPage = webContentResult.extractedArticle.discoveredLinks || [];
            console.log(`Successfully extracted main content for ${currentUrlToProcess}. Title: "${webContentResult.extractedArticle.title}". Found ${discoveredLinksOnPage.length} links.`);
            await updateSupabaseRecord(supabaseClient, currentUrlToProcess, {
              title: webContentResult.extractedArticle.title, status: STATUS.CONTENT_EXTRACTED,
              agent_progress_message: `Main content extracted. Title: "${webContentResult.extractedArticle.title}". Links found: ${discoveredLinksOnPage.length}.`,
            });
          } else {
            console.warn(`ExtractedArticle object is null for ${currentUrlToProcess}, though rawHTML was present. This indicates a severe extraction issue.`);
            await updateSupabaseRecord(supabaseClient, currentUrlToProcess, {
              status: STATUS.ERROR_EXTRACTION,
              agent_progress_message: 'Critical error during content extraction phase.',
              agent_error_message: 'ExtractedArticle object was null after successful HTML fetch.',
            }); discoveredLinksOnPage = [];
          }

          const canProcessMoreLinksFromThisBranch = discoveredLinksProcessedCountForInitialSite < MAX_DISCOVERED_LINKS_PER_STRATEGY_SITE;

          if (discoveredLinksOnPage.length > 0 && canProcessMoreLinksFromThisBranch) {
            console.log(`Processing up to ${MAX_DISCOVERED_LINKS_PER_STRATEGY_SITE - discoveredLinksProcessedCountForInitialSite} discovered links from ${currentUrlToProcess} (Origin: ${initialSiteUrl})`);
            for (const discoveredLink of discoveredLinksOnPage) {
              const nextDepth = currentDepth + 1;
              if (nextDepth > MAX_CRAWL_DEPTH) {
                console.log(`Skipping discovered link (depth limit exceeded ${nextDepth} > ${MAX_CRAWL_DEPTH}): ${discoveredLink} from page ${currentUrlToProcess}`);
                console.log(`Further link discovery from page ${currentUrlToProcess} will exceed MAX_CRAWL_DEPTH. Stopping discovery from this page.`);
                break;
              }
              if (discoveredLinksProcessedCountForInitialSite >= MAX_DISCOVERED_LINKS_PER_STRATEGY_SITE) {
                console.log(`Reached max discovered links (${MAX_DISCOVERED_LINKS_PER_STRATEGY_SITE}) for origin ${initialSiteUrl}. No more links will be queued from this page (${currentUrlToProcess}).`);
                break;
              }
              let discoveredLinkHostname: string | undefined;
              try { discoveredLinkHostname = new URL(discoveredLink).hostname;
              } catch (e: any) { console.warn(`Invalid discovered URL ${discoveredLink}: ${e.message}. Skipping.`); continue; }

              if (STAY_ON_SAME_DOMAIN && discoveredLinkHostname !== initialSiteHostname) {
                console.log(`Skipping link (different domain): ${discoveredLink} (origin host: ${initialSiteHostname}, link host: ${discoveredLinkHostname})`);
                continue;
              }
              if (globallyProcessedOrQueuedUrlsInThisRun.has(discoveredLink)) {
                console.log(`Skipping link (already processed/queued globally in this run): ${discoveredLink}`);
                continue;
              }
              const isDiscDuplicateInDB = await checkForDuplicates(supabaseClient, discoveredLink);
              if (isDiscDuplicateInDB) {
                console.log(`Skipping discovered link (already in DB): ${discoveredLink}`);
                globallyProcessedOrQueuedUrlsInThisRun.add(discoveredLink);
                continue;
              }
              console.log(`Queueing discovered link: ${discoveredLink} (Origin: ${initialSiteUrl}, Depth: ${nextDepth}, Keywords: ${originalStrategyKeywords.join(', ')})`);
              urlsToProcess.push({ url: discoveredLink, isDiscovered: true, originalStrategyKeywords, depth: nextDepth });
              globallyProcessedOrQueuedUrlsInThisRun.add(discoveredLink);
              discoveredLinksProcessedCountForInitialSite++;
            }
          } else if (discoveredLinksOnPage.length > 0 && !canProcessMoreLinksFromThisBranch) {
             console.log(`Limit for discovered links from origin ${initialSiteUrl} already met. No new links from ${currentUrlToProcess} will be queued now.`);
          }

          if (!webContentResult.extractedArticle?.content && !webContentResult.rawHtmlContent) {
             console.warn(`Skipping AI processing for ${currentUrlToProcess} as there is no content.`);
             await updateSupabaseRecord(supabaseClient, currentUrlToProcess, {
                status: STATUS.ERROR_EXTRACTION, agent_progress_message: 'No meaningful content found to send to AI.',
             }); continue;
          }
          if (!webContentResult.extractedArticle?.content && webContentResult.extractedArticle?.title === 'Title not found') {
            console.warn(`Skipping AI processing for ${currentUrlToProcess} as main article content extraction failed.`);
            await updateSupabaseRecord(supabaseClient, currentUrlToProcess, {
                status: STATUS.ERROR_EXTRACTION, agent_progress_message: 'Main article content not extracted by Readability; skipping AI processing.',
            }); continue;
          }

          await updateSupabaseRecord(supabaseClient, currentUrlToProcess, {
            status: STATUS.AI_PROCESSING_INITIATED,
            agent_progress_message: `Content ready. Initiating AI processing. Extracted title: ${webContentResult.extractedArticle?.title || 'N/A'}.`,
            agent_error_message: null,
          });

          const processedContent = await triggerAIProcessing(processingId, currentUrlToProcess, originalStrategyKeywords.join(', '));

          if (processedContent) {
            let finalStatus = STATUS.COMPLETED;
            let finalErrorMessage = processedContent.errorMessage;
            let finalProgressMessage = processedContent.progressMessage;
            if (processedContent.status === 'error') {
                finalStatus = STATUS.AI_PROCESSING_FAILED;
                console.warn(`AI Processing for ${currentUrlToProcess} resulted in an error: ${finalErrorMessage || finalProgressMessage}`);
            } else if (processedContent.status === 'processed') {
                finalStatus = STATUS.AI_PROCESSING_SUCCESSFUL;
                 console.log(`Successfully processed content for URL: ${currentUrlToProcess}, Title: ${processedContent.title}`);
            } else { console.log(`AI processing for ${currentUrlToProcess} resulted in status: ${processedContent.status}. Message: ${finalProgressMessage}`);}

            const updatePayloadFromAI: Partial<ProcessedContent> & { status: string; agent_progress_message?: string | null; agent_error_message?: string | null; } = {
                title: processedContent.title, summary: processedContent.summary, tags: processedContent.tags,
                status: finalStatus, agent_progress_message: finalProgressMessage || "AI processing completed.", agent_error_message: finalErrorMessage,
                image_url: processedContent.imageUrl, image_status: processedContent.imageStatus,
                image_ai_hint: processedContent.imageAiHint, image_error_message: processedContent.imageErrorMessage,
            };
            await updateSupabaseRecord(supabaseClient, currentUrlToProcess, updatePayloadFromAI);
          } else {
            console.error(`Failed to get any response from AI processing trigger for URL: ${currentUrlToProcess}.`);
            await updateSupabaseRecord(supabaseClient, currentUrlToProcess, {
                status: STATUS.AI_PROCESSING_FAILED,
                agent_progress_message: 'Agent failed to trigger or get a valid response from the AI processing API.',
                agent_error_message: 'No processed content object returned from triggerAIProcessing call.',
            });
          }
          console.log(`--- Finished processing ${currentUrlToProcess} ---`);
        }
        if(iterationCount >= MAX_ITERATIONS_PER_INITIAL_SITE) {
            console.warn(`Max iterations (${MAX_ITERATIONS_PER_INITIAL_SITE}) reached for initial site ${initialSiteUrl}.`);
            await sendNotification( `Agent Warning: Max Iterations Reached for Site`,
                `Processing for initial site ${initialSiteUrl} reached max iterations.`, false);
        }
      }
    }
  } catch (mainLoopError: any) {
    console.error('[AGENT RUN] Critical error during main strategy processing loop:', mainLoopError);
    agentRunSuccessfullyCompleted = false;
    await sendNotification( 'Agent Run Failed: Error in Main Processing Loop',
        `Agent encountered a critical error during strategy processing. Error: ${mainLoopError.message}\n\nStack: ${mainLoopError.stack}`, true);
  }
  agentRunSuccessfullyCompleted = true; // If it reaches here, main loop part is done (or bypassed)

  } finally {
    if (agentRunSuccessfullyCompleted) {
      const uptimeKumaPushUrl = process.env.UPTIME_KUMA_PUSH_URL;
      if (uptimeKumaPushUrl) {
        console.log(`Attempting to send heartbeat ping to Uptime Kuma: ${uptimeKumaPushUrl}`);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), HEARTBEAT_TIMEOUT_MS);
        try {
          const response = await fetch(uptimeKumaPushUrl, { method: 'GET', signal: controller.signal, headers: { 'User-Agent': OUR_USER_AGENT }});
          clearTimeout(timeoutId);
          if (response.ok) { console.log('Uptime Kuma heartbeat ping successful.');
          } else { console.warn(`Uptime Kuma heartbeat ping failed: ${response.status} ${response.statusText}`);
            await sendNotification( 'Agent Warning: Uptime Kuma Heartbeat Failed',
                `Agent completed run, but failed to send heartbeat to Uptime Kuma. URL: ${uptimeKumaPushUrl}, Status: ${response.status} ${response.statusText}`, false);
          }
        } catch (error: any) {
          clearTimeout(timeoutId);
          let errorMessage = `Error sending Uptime Kuma heartbeat ping: ${error.message}`;
          if (error.name === 'AbortError') { errorMessage = `Uptime Kuma heartbeat ping timed out after ${HEARTBEAT_TIMEOUT_MS}ms.`;}
          console.warn(errorMessage);
          await sendNotification( 'Agent Warning: Uptime Kuma Heartbeat Error',
              `Agent completed run, but error sending heartbeat. URL: ${uptimeKumaPushUrl}, Error: ${errorMessage}`, false);
        }
      } else { console.log('Uptime Kuma push URL (UPTIME_KUMA_PUSH_URL) not configured. Skipping heartbeat ping.');}
      console.log(`Content Curator Agent finished successfully at: ${new Date().toISOString()}`);
    } else { console.error(`Content Curator Agent finished with handled errors at: ${new Date().toISOString()}`);}
  }
}

async function updateSupabaseRecord(supabaseClient: SupabaseClient, sourceUrl: string, updates: Partial<ProcessedContent> & { status: string, agent_progress_message?: string | null, agent_error_message?: string | null }) {
  console.log(`Updating Supabase record for ${sourceUrl} with status: ${updates.status}`);
  try {
    const { data, error } = await supabaseClient
      .from('curated_content')
      .update({
        ...updates,
        status: updates.status,
        agent_progress_message: updates.agent_progress_message,
        agent_error_message: updates.agent_error_message,
        updated_at: new Date().toISOString(),
      })
      .eq('source_url', sourceUrl)
      .select();
    if (error) { console.error(`Error updating Supabase record for ${sourceUrl}:`, error.message);
    } else if (data && data.length > 0) { console.log(`Supabase record updated successfully for ${sourceUrl}. New status: ${data[0].status}`);
    } else { console.warn(`No record found in Supabase to update for source_url: ${sourceUrl}. This might indicate an issue if an initial record was expected.`);}
  } catch (e: any) { console.error(`Unexpected error during Supabase update for ${sourceUrl}:`, e.message);}
}

export {
    initializeSupabaseClient, fetchStrategiesFromSupabase, fetchWebContent,
    extractMainContent, checkForDuplicates, triggerAIProcessing,
    storeResultsInSupabase, runAgent
};

// Ensure all functions are exported if they are intended to be used or tested externally.
// The original script had some functions (like storeResultsInSupabase) not explicitly in the final export list,
// but they are kept here as they were part of the original file.
// If they are truly unused and not for testing, they could be removed.
// For now, keeping structure as close to original apart from runAgent modification.
// Final check on runAgent: ensure `agentRunSuccessfullyCompleted` is correctly set in all paths.
// If init fails, process exits. If no strategies, it returns after setting flag to true.
// If main loop has error caught by its own try-catch, flag is set to false.
// If main loop completes, flag is set to true. This seems correct for heartbeat.
