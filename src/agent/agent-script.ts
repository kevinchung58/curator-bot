
/**
 * @fileOverview Content Curator Agent script.
 * This script is intended to be run by a scheduler (e.g., GitHub Actions).
 * It fetches content curation strategies, discovers new content,
 * processes it using AI (by calling a Next.js API endpoint), and stores the results in Supabase.
 */

import { config } from 'dotenv';
config(); // Load .env file for local development/testing of this script

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import robotsParser from 'robots-parser';
import type { ProcessedContent, SearchStrategy } from '@/lib/definitions'; // Adjust path as needed
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';

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

const OUR_USER_AGENT = 'ContentCuratorBot/1.0 (+http://yourprojecturl.com/botinfo)';

// --- Notification Function Stub ---
/**
 * Sends a notification for critical errors or important warnings.
 * Currently logs to console. TODO: Implement actual notification (email, Slack, etc.)
 * @param subject - The subject of the notification.
 * @param body - The body content of the notification.
 * @param isCritical - Whether the notification is for a critical error (true) or a warning (false).
 */
async function sendNotification(subject: string, body: string, isCritical: boolean = true): Promise<void> {
  console.log(`\n--- AGENT NOTIFICATION ---`);
  if (isCritical) {
    console.error(`🔴 CRITICAL ERROR ALERT 🔴`);
  } else {
    console.warn(`🟡 WARNING 🟡`);
  }
  console.log(`Subject: ${subject}`);
  console.log(`Body:\n${body}`);
  console.log(`--- END OF NOTIFICATION ---`);
  // TODO: Implement actual notification logic (e.g., email using Nodemailer, Slack API call).
  // This would likely involve:
  // 1. Importing necessary libraries (e.g., nodemailer).
  // 2. Using environment variables for credentials and destination addresses:
  //    - EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS (for SMTP)
  //    - NOTIFICATION_EMAIL_FROM, NOTIFICATION_EMAIL_TO
  //    - SLACK_WEBHOOK_URL
  // 3. Constructing and sending the notification.
  // Example (conceptual for email):
  // if (process.env.EMAIL_HOST && process.env.NOTIFICATION_EMAIL_TO) {
  //   // const transporter = nodemailer.createTransport({...});
  //   // await transporter.sendMail({
  //   //   from: process.env.NOTIFICATION_EMAIL_FROM,
  //   //   to: process.env.NOTIFICATION_EMAIL_TO,
  //   //   subject: `Agent Notification: ${subject}`,
  //   //   text: body,
  //   // });
  // }
  return Promise.resolve(); // Make it async-ready
}

// Interface for the extracted article content
interface ExtractedArticle {
  title: string;
  content: string; // Plain text content
  htmlContent: string; // Simplified HTML content
  excerpt?: string;
  byline?: string;
  dir?: string;
  length?: number;
  discoveredLinks: string[]; // Added for new requirement
}

/**
 * Initializes the Supabase client.
 * Throws an error if Supabase environment variables are not set.
 */
async function initializeSupabaseClient(): Promise<SupabaseClient> {
  console.log('Initializing Supabase client...');
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Supabase URL or Anon Key is not defined in environment variables.');
    throw new Error('Supabase environment variables not set. Agent cannot connect to database.');
  }

  if (!supabase) {
    supabase = createClient(supabaseUrl, supabaseAnonKey);
    console.log('Supabase client initialized.');
  }
  return supabase;
}

/**
 * Fetches search strategies from the 'search_strategies' table in Supabase.
 * Returns a default mock strategy if fetching fails or no strategies are found.
 * @param {SupabaseClient} supabaseClient - The Supabase client instance.
 * @returns {Promise<SearchStrategy[]>} - Array of search strategies.
 */
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
    // Ensure the data conforms to SearchStrategy type, especially for keywords, targetSites, and contentTypesToMonitor
    return data.map(strategy => ({
        keywords: Array.isArray(strategy.keywords) ? strategy.keywords : (typeof strategy.keywords === 'string' ? [strategy.keywords] : []),
        targetSites: Array.isArray(strategy.target_sites) ? strategy.target_sites : (typeof strategy.target_sites === 'string' ? [strategy.target_sites] : []),
        contentTypesToMonitor: Array.isArray(strategy.content_types_to_monitor) ? strategy.content_types_to_monitor : (typeof strategy.content_types_to_monitor === 'string' ? [strategy.content_types_to_monitor] : []),
        // Include other fields if your SearchStrategy type and Supabase table have them
        // id: strategy.id, 
        // user_id: strategy.user_id,
        // name: strategy.name,
    }));
  } catch (e: any) {
    console.error('Unexpected error during fetchStrategiesFromSupabase:', e.message);
    console.log('Falling back to default mock strategy due to unexpected error.');
    return [{ keywords: ['AI in education'], targetSites: ['https://www.example.com/ai-news'], contentTypesToMonitor: ['articles', 'blog posts'] }];
  }
}

/**
 * Fetches raw HTML content from a given URL.
 * In a real-world scenario, this might be expanded to parse the site for multiple article links.
 * For now, it fetches the content of the given URL.
 * @param {string} url - The URL to fetch.
 * @returns {Promise<string | null>} - The HTML content or null if failed.
 */

// Function to get the robots.txt URL for a given website URL
function getRobotsTxtUrl(websiteUrl: string): string {
  const urlObj = new URL(websiteUrl);
  return `${urlObj.protocol}//${urlObj.host}/robots.txt`;
}

/**
 * Extracts unique, absolute HTTP/HTTPS links from a JSDOM object.
 * @param dom The JSDOM instance of the page.
 * @param baseUrl The base URL of the page to resolve relative links.
 * @returns An array of unique string URLs.
 */
function extractLinksFromHtml(dom: JSDOM, baseUrl: string): string[] {
  const links = new Set<string>();
  const elements = dom.window.document.querySelectorAll('a');

  elements.forEach(element => {
    const href = element.getAttribute('href');
    if (href) {
      try {
        const absoluteUrl = new URL(href, baseUrl).href;
        const urlObj = new URL(absoluteUrl); // Parse again to check protocol easily
        if (urlObj.protocol === 'http:' || urlObj.protocol === 'https:') {
          // Basic filter for common non-content file types - can be expanded
          const path = urlObj.pathname.toLowerCase();
          if (!path.endsWith('.css') && !path.endsWith('.js') &&
              !path.endsWith('.png') && !path.endsWith('.jpg') && !path.endsWith('.jpeg') &&
              !path.endsWith('.gif') && !path.endsWith('.svg') && !path.endsWith('.zip') &&
              !path.endsWith('.pdf') && !path.endsWith('.xml') && !path.endsWith('.json')) {
            links.add(absoluteUrl);
          }
        }
      } catch (e) {
        // console.warn(`Invalid URL found or error in processing link "${href}": ${e.message}`);
      }
    }
  });
  return Array.from(links);
}

// Function to extract main content using Readability and also discover links
function extractMainContent(htmlContent: string, url: string): ExtractedArticle | null {
  console.log(`Extracting main content and links from URL: ${url}`);
  try {
    const doc = new JSDOM(htmlContent, { url });
    // Set the document URL, which Readability uses for better parsing
    doc.window.document.documentURI = url;

    const reader = new Readability(doc.window.document);
    const article = reader.parse();

    // Extract links regardless of whether an article was parsed, as links might be on non-article pages too.
    const discoveredLinks = extractLinksFromHtml(doc, url);

    if (article) {
      console.log(`Successfully extracted article: "${article.title}" for URL: ${url}. Found ${discoveredLinks.length} links.`);
      return {
        title: article.title,
        content: article.textContent || '',
        htmlContent: article.content,
        excerpt: article.excerpt,
        byline: article.byline,
        dir: article.dir,
        length: article.length,
        discoveredLinks: discoveredLinks,
      };
    } else {
      console.warn(`Readability could not parse article content from URL: ${url}. Still returning ${discoveredLinks.length} discovered links.`);
      // Even if no "article" is found, we might have found links on the page.
      // Return a minimal ExtractedArticle structure with links.
      // Title could be from <title> tag if available, JSDOM provides doc.window.document.title
      return {
        title: doc.window.document.title || 'Title not found', // Fallback title
        content: '', // No article text content
        htmlContent: '', // No article HTML content
        discoveredLinks: discoveredLinks,
        // Other fields can be undefined or have default values
      };
    }
  } catch (error: any) {
    console.error(`Error during content/link extraction for ${url}: ${error.message}`);
    return null; // On critical error during JSDOM parsing or Readability, return null overall
  }
}

// Interface for the object returned by fetchWebContent
// No change needed here if ExtractedArticle (part of extractedArticle field) now contains discoveredLinks.
interface WebContentFetchResult {
  url: string;
  rawHtmlContent: string | null;
  extractedArticle: ExtractedArticle | null;
  error?: string; // For general errors during fetching or processing
  robotsTxtDisallowed?: boolean; // Specifically for robots.txt issues
}

async function fetchWebContent(targetUrl: string): Promise<WebContentFetchResult> {
  console.log(`Fetching web content from: ${targetUrl}`);
  let rawHtmlContent: string | null = null;
  let errorState: string | undefined;
  let robotsTxtDisallowed = false;
  let attempt = 0;

  try {
    // --- robots.txt Fetching (current behavior: no specific retries, logs warning on failure) ---
    const robotsTxtUrl = getRobotsTxtUrl(targetUrl);
    let robots;
    try {
      console.log(`Fetching robots.txt from: ${robotsTxtUrl}`);
      const robotsResponse = await fetch(robotsTxtUrl, {
        headers: { 'User-Agent': OUR_USER_AGENT },
      });
      if (robotsResponse.ok) {
        const robotsTxtContent = await robotsResponse.text();
        // Note: The robotsParser function expects the URL of the robots.txt file itself,
        // and the content as a string. The original library usage might vary.
        // Ensure the library you're using (e.g., 'robots-parser') matches this calling convention.
        robots = robotsParser(robotsTxtUrl, robotsTxtContent);
        console.info(`Successfully fetched and parsed robots.txt for ${targetUrl}`);
      } else {
        console.warn(`Could not fetch robots.txt from ${robotsTxtUrl}, proceeding without it. Status: ${robotsResponse.status} ${robotsResponse.statusText}`);
      }
    } catch (error: any) {
      console.warn(`Error fetching or parsing robots.txt from ${robotsTxtUrl}, proceeding without it: ${error.message}`);
    }

    if (robots) {
        const isAllowed = robots.isAllowed(targetUrl, OUR_USER_AGENT);
        if (!isAllowed) {
            console.log(`Fetching disallowed by robots.txt for ${targetUrl} for user agent ${OUR_USER_AGENT}`);
            robotsTxtDisallowed = true;
            // Return structured object indicating disallowed
            return { url: targetUrl, rawHtmlContent: null, extractedArticle: null, error: 'robots.txt disallows fetching', robotsTxtDisallowed };
        }
        console.log(`Fetching allowed by robots.txt for ${targetUrl} for user agent ${OUR_USER_AGENT}`);
    } else {
        console.log(`No robots.txt processed or applicable for ${targetUrl}, proceeding with fetch.`);
    }

    // --- Main Content Fetching with Retries and Timeout ---
    for (attempt = 0; attempt < MAX_FETCH_RETRIES; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      try {
        console.log(`Attempt ${attempt + 1}/${MAX_FETCH_RETRIES} to fetch ${targetUrl}`);
        const response = await fetch(targetUrl, {
          headers: { 'User-Agent': OUR_USER_AGENT },
          signal: controller.signal, // Integrate AbortController for timeout
          redirect: 'follow', // Default, but good to be explicit
        });

        clearTimeout(timeoutId); // Clear timeout if fetch completes/fails normally

        if (response.ok) {
          rawHtmlContent = await response.text();
          console.log(`Successfully fetched raw HTML from ${targetUrl} on attempt ${attempt + 1}. Length: ${rawHtmlContent.length}`);
          errorState = undefined; // Clear any previous attempt's error
          break; // Success, exit retry loop
        } else {
          errorState = `Failed to fetch ${targetUrl}: ${response.status} ${response.statusText}`;
          // Retry for server errors (5xx) or common transient errors, but not for client errors (4xx) like 404.
          if (response.status >= 500 && response.status <= 599) {
            console.warn(`${errorState}. Attempt ${attempt + 1}/${MAX_FETCH_RETRIES}. Retrying after ${FETCH_RETRY_DELAY_MS}ms...`);
            if (attempt < MAX_FETCH_RETRIES - 1) {
              await new Promise(resolve => setTimeout(resolve, FETCH_RETRY_DELAY_MS));
              continue; // Next attempt
            }
          } else {
            // Non-retryable HTTP error (e.g., 404 Not Found, 403 Forbidden)
            console.error(`${errorState}. This is a non-retryable HTTP error. Not retrying.`);
            return { url: targetUrl, rawHtmlContent: null, extractedArticle: null, error: errorState, robotsTxtDisallowed };
          }
        }
      } catch (fetchError: any) {
        clearTimeout(timeoutId); // Clear timeout if fetch itself throws an error
        errorState = `Fetch error for ${targetUrl}: ${fetchError.message}`;
        if (fetchError.name === 'AbortError') {
          errorState = `Fetch timed out for ${targetUrl} after ${FETCH_TIMEOUT_MS}ms.`;
        }
        console.warn(`${errorState}. Attempt ${attempt + 1}/${MAX_FETCH_RETRIES}.`);
        if (attempt < MAX_FETCH_RETRIES - 1) {
          console.log(`Retrying after ${FETCH_RETRY_DELAY_MS}ms...`);
          await new Promise(resolve => setTimeout(resolve, FETCH_RETRY_DELAY_MS));
          continue; // Next attempt
        }
      }
    } // End of retry loop

    if (!rawHtmlContent) {
      // If loop finished without success (e.g., all retries failed)
      console.error(`Failed to fetch ${targetUrl} after ${MAX_FETCH_RETRIES} attempts. Last error: ${errorState}`);
      return { url: targetUrl, rawHtmlContent: null, extractedArticle: null, error: `Failed after ${MAX_FETCH_RETRIES} retries: ${errorState}`, robotsTxtDisallowed };
    }

    // --- Content Extraction (existing logic) ---
    const extractedArticle = extractMainContent(rawHtmlContent, targetUrl);

    if (extractedArticle) {
      console.log(`Main content successfully extracted for ${targetUrl}. Title: ${extractedArticle.title}`);
    } else {
      console.warn(`Main content extraction failed or returned no article for ${targetUrl}. Raw HTML will be available.`);
    }

    return { url: targetUrl, rawHtmlContent, extractedArticle, error: errorState, robotsTxtDisallowed };

  } catch (error: any) {
    console.error(`Unexpected error during fetchWebContent for ${targetUrl}: ${error.message}`);
    // Ensure a consistent return structure for unexpected errors
    return { url: targetUrl, rawHtmlContent: null, extractedArticle: null, error: error.message, robotsTxtDisallowed };
  }
}

/**
 * Checks for duplicate content in Supabase by URL in the 'curated_content' table.
 * @param {SupabaseClient} supabaseClient - The Supabase client instance.
 * @param {string} sourceUrl - The URL of the content to check.
 * @returns {Promise<boolean>} - True if URL already exists, false otherwise.
 */
async function checkForDuplicates(supabaseClient: SupabaseClient, sourceUrl: string): Promise<boolean> {
  console.log(`Checking for duplicates for URL in 'curated_content': ${sourceUrl}`);
  try {
    const { data, error, count } = await supabaseClient
      .from('curated_content')
      .select('id', { count: 'exact', head: true }) // head:true for performance, only get count
      .eq('source_url', sourceUrl);

    if (error) {
      console.error('Error checking for duplicates in Supabase:', error.message);
      return false; // Assume not duplicate on error to allow processing attempt, or handle error more strictly
    }
    
    const isDuplicate = count !== null && count > 0;
    console.log(isDuplicate ? `URL '${sourceUrl}' is a duplicate.` : `URL '${sourceUrl}' is not a duplicate.`);
    return isDuplicate;
  } catch (e: any) {
    console.error('Unexpected error during checkForDuplicates:', e.message);
    return false;
  }
}

/**
 * Triggers AI processing for the discovered content by calling a Next.js API endpoint.
 * The Next.js API endpoint is responsible for invoking the Genkit flow.
 * @param {string} articleId - A unique ID for this processing job (can be generated by agent).
 * @param {string} articleUrl - The URL of the article to process.
 * @param {string} topic - The topic for content processing.
 * @returns {Promise<ProcessedContent | null>} - The processed content or null if failed.
 */
async function triggerAIProcessing(articleId: string, articleUrl: string, topic: string): Promise<ProcessedContent | null> {
  console.log(`Triggering AI processing for URL: ${articleUrl}, Topic: ${topic}`);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL; // URL of the deployed Next.js app

  if (!appUrl) {
    console.error('NEXT_PUBLIC_APP_URL is not set. Cannot call AI processing API.');
    // Return an error-like ProcessedContent structure
    return {
        id: articleId,
        sourceUrl: articleUrl,
        title: 'Agent Misconfiguration',
        summary: 'NEXT_PUBLIC_APP_URL not configured in agent environment. AI processing API endpoint could not be called.',
        tags: ['error', 'agent-config-error'],
        status: 'error',
        progressMessage: 'AI processing skipped due to missing NEXT_PUBLIC_APP_URL.',
        errorMessage: 'NEXT_PUBLIC_APP_URL not configured for agent API calls.',
        imageStatus: 'none',
    };
  }

  const apiEndpoint = `${appUrl.replace(/\/$/, '')}/api/agent/process-content`;
  const requestBody: AgentProcessApiRequest = { articleId, articleUrl, topic };

  console.log(`Calling Next.js API endpoint: POST ${apiEndpoint}`);
  try {
    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        // TODO: Consider adding a secret API key for this agent-only endpoint
        // 'X-Agent-Api-Key': process.env.AGENT_API_KEY || '' 
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      let errorDataText = 'No error details from API.';
      try {
        errorDataText = await response.text();
      } catch (e) {}
      console.error(`AI Processing API error: ${response.status} ${response.statusText}. Response: ${errorDataText.substring(0, 500)}`);
      return {
        id: articleId,
        sourceUrl: articleUrl,
        title: 'API Processing Error',
        summary: `Failed to process content via API. Status: ${response.status}. Details: ${errorDataText.substring(0,200)}`,
        tags: ['error', 'api-error'],
        status: 'error',
        errorMessage: `API returned ${response.status}: ${errorDataText.substring(0,200)}`,
        progressMessage: `Error calling AI processing API: ${response.status}`,
        imageStatus: 'none',
      };
    }

    const result: AgentProcessApiResponse = await response.json();
    if (result.error || !result.processedContent) {
        console.error('AI Processing API returned an error or no content:', result.error || 'No processedContent in response');
        return {
            id: articleId,
            sourceUrl: articleUrl,
            title: 'AI Processing Failed by API',
            summary: result.error || result.message || 'The API reported a failure during AI processing.',
            tags: ['error', 'ai-failure-via-api'],
            status: 'error',
            errorMessage: result.error || result.message || 'API reported AI failure.',
            progressMessage: result.message || 'AI processing via API failed.',
            imageStatus: 'none',
        };
    }
    
    console.log('AI processing successful via API for:', result.processedContent?.title);
    return result.processedContent;
  } catch (error: any) {
    console.error('Error calling AI processing API:', error.message);
    return {
        id: articleId,
        sourceUrl: articleUrl,
        title: 'Network Error Calling API',
        summary: `Could not connect to the AI processing API endpoint at ${apiEndpoint}. Error: ${error.message}`,
        tags: ['error', 'network-error', 'agent-api-call-failed'],
        status: 'error',
        errorMessage: `Network error calling API: ${error.message}`,
        progressMessage: 'Failed to connect to AI processing API.',
        imageStatus: 'none',
    };
  }
}

/**
 * Stores the processed content results in the 'curated_content' table in Supabase.
 * @param {SupabaseClient} supabaseClient - The Supabase client instance.
 * @param {ProcessedContent} processedData - The content data to store.
 */
async function storeResultsInSupabase(supabaseClient: SupabaseClient, processedData: ProcessedContent) {
  console.log(`Storing results in Supabase 'curated_content' for title: ${processedData.title}`);
  try {
    // Ensure all fields match the 'curated_content' table schema
    // and ProcessedContent type. Handle potential undefined fields gracefully.
    const { data, error } = await supabaseClient
      .from('curated_content')
      .insert([
        {
          // id: processedData.id, // Assuming 'id' in Supabase is auto-generated (UUID or serial)
                                  // If agent generates ID, ensure it's unique or handle conflicts.
                                  // For now, let Supabase generate 'id'.
          title: processedData.title,
          summary: processedData.summary,
          tags: processedData.tags, // Supabase expects array type for 'tags' (e.g., text[])
          source_url: processedData.sourceUrl, // Ensure this column has a UNIQUE constraint
          status: processedData.status,
          // created_at: new Date().toISOString(), // Supabase typically handles 'created_at' with default now()
          agent_progress_message: processedData.progressMessage, 
          agent_error_message: processedData.errorMessage, 
          // image_url: processedData.imageUrl, // Optional, if storing image URL (not data URI)
          // image_ai_hint: processedData.imageAiHint, // Optional
          // image_status: processedData.imageStatus, // Optional
          // image_error_message: processedData.imageErrorMessage, // Optional
          // raw_web_content: null, // Example: if you were storing raw fetched content.
        },
      ])
      .select(); // .select() can be used to get back the inserted row(s)

    if (error) {
      console.error('Error storing results in Supabase:', error.message);
      // More detailed error logging
      if (error.code === '23505') { // Unique constraint violation
        console.error(`Supabase unique constraint violation for source_url: ${processedData.sourceUrl}. This content might have been processed by another instance or already exists.`);
      }
    } else {
      console.log('Results stored successfully in Supabase. Inserted data (first item):', data ? data[0] : 'No data returned');
    }
  } catch (e: any) {
    console.error('Unexpected error during storeResultsInSupabase:', e.message);
  }
}


/**
 * Main function for the agent.
 * Initializes Supabase, fetches strategies, discovers/processes content, and stores results.
 */
async function runAgent() {
  console.log(`Content Curator Agent started running at: ${new Date().toISOString()}`);
  const globallyProcessedOrQueuedUrlsInThisRun = new Set<string>(); // Tracks all URLs processed or queued in this entire agent run
  let supabaseClient;

  try {
    supabaseClient = await initializeSupabaseClient();
  } catch (error: any) {
    const errorMessage = `Agent critical error: Failed to initialize Supabase. Agent cannot continue. Error: ${error.message}`;
    console.error(errorMessage);
    await sendNotification(
        'Agent Failed: Supabase Initialization Error',
        `${errorMessage}\n\nStack: ${error.stack}`,
        true
    );
    process.exit(1); // Exit if Supabase can't be initialized
  }

  const strategies = await fetchStrategiesFromSupabase(supabaseClient);

  if (!strategies || strategies.length === 0) {
    const warningMessage = 'No search strategies found or fetched from Supabase. The agent has no work to do.';
    console.warn(warningMessage);
    await sendNotification(
        'Agent Warning: No Search Strategies',
        warningMessage,
        false // Not critical, but an important operational note
    );
    console.log('Agent will exit as there are no strategies to process.');
    return;
  }
  console.log(`Processing ${strategies.length} strategies.`);

  // Overall try-catch for the strategy processing loop
  try {
    for (const strategy of strategies) {
      console.log(`\nProcessing strategy: Keywords - ${(strategy.keywords || []).join(', ')}, Initial Sites: ${(strategy.targetSites || []).join(', ')}`);
      const baseStrategyKeywords = strategy.keywords || ['untagged'];

      for (const initialSiteUrl of (strategy.targetSites || [])) {
        // Queue items will now be objects to carry discovery context
        const urlsToProcess: { url: string; isDiscovered: boolean; originalStrategyKeywords: string[]; }[] = [
          { url: initialSiteUrl, isDiscovered: false, originalStrategyKeywords: baseStrategyKeywords }
        ];
        let discoveredLinksProcessedCountForInitialSite = 0;
        let initialSiteHostname: string | undefined;
        try {
          initialSiteHostname = new URL(initialSiteUrl).hostname;
        } catch (e: any) {
          console.error(`Invalid initialSiteUrl ${initialSiteUrl}: ${e.message}. Skipping this initial site.`);
          await sendNotification(
            `Agent Error: Invalid Initial Site URL`,
            `The URL "${initialSiteUrl}" from a strategy is invalid and cannot be processed. Error: ${e.message}`,
            true
          );
          continue;
        }


        let iterationCount = 0;
        const MAX_ITERATIONS_PER_INITIAL_SITE = 100;

        while (urlsToProcess.length > 0 && iterationCount < MAX_ITERATIONS_PER_INITIAL_SITE) {
          iterationCount++;
          const currentUrlObject = urlsToProcess.shift(); // Now an object
          if (!currentUrlObject) continue;

          const { url: currentUrlToProcess, isDiscovered, originalStrategyKeywords } = currentUrlObject;

          console.log(`\n---\nAttempting to process URL: ${currentUrlToProcess} (Origin: ${initialSiteUrl}, Discovered: ${isDiscovered})`);

          // Check if URL was already processed or queued in this entire agent run
          // Allow initialSiteUrl to proceed if it's its first appearance from this specific strategy's initialSiteUrl list
          if (globallyProcessedOrQueuedUrlsInThisRun.has(currentUrlToProcess) && currentUrlToProcess !== initialSiteUrl) {
             // This condition needs refinement: an initialSiteUrl for strategy B could have been a discovered link from strategy A.
             // The key is that `globallyProcessedOrQueuedUrlsInThisRun` prevents any URL from being fully processed (fetch onwards) more than once per agent run.
             // The initial check before this while loop for `initialSiteUrl` might need adjustment.
             // For now: if it's in global, and it's not the very first one from THIS initialSiteUrl list, skip.
             // This is complex. Let's simplify: if globally processed, only allow if it IS an initialSiteUrl just being introduced.
             // The critical part is adding to globallyProcessedOrQueuedUrlsInThisRun *before* DB check.
            if (currentUrlToProcess !== initialSiteUrl || (currentUrlToProcess === initialSiteUrl && isDiscovered)) { // isDiscovered helps if an initial site is re-queued as discovered
                console.log(`Skipping ${currentUrlToProcess} as it's already processed or queued in this run from another path.`);
                continue;
            }
          }

          globallyProcessedOrQueuedUrlsInThisRun.add(currentUrlToProcess);

          const isDuplicateInDB = await checkForDuplicates(supabaseClient, currentUrlToProcess);
          if (isDuplicateInDB) {
            console.log(`Skipping ${currentUrlToProcess} as it's already processed in DB.`);
            globallyProcessedOrQueuedUrlsInThisRun.add(currentUrlToProcess);
            continue;
          }

          const processingId = `agent-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

          // --- Step 1: Create Initial Record in Supabase ---
          let tagsForRecord = originalStrategyKeywords;
          if (isDiscovered) {
            tagsForRecord = [...new Set([...tagsForRecord, 'discovered'])]; // Add 'discovered' tag
          }

          const initialRecordData: Partial<ProcessedContent> & { source_url: string; status: string; agent_id?: string; } = {
            source_url: currentUrlToProcess,
            title: `Processing: ${currentUrlToProcess}`,
            summary: 'Agent processing started.',
            tags: tagsForRecord,
            status: STATUS.PROCESSING_STARTED,
            agent_progress_message: `Agent picked up URL for processing. Discovered: ${isDiscovered}.`,
            agent_id: processingId,
          };
          try {
            const { error: insertError } = await supabaseClient.from('curated_content').insert([initialRecordData]).select();
            if (insertError) {
              console.error(`Error inserting initial record for ${currentUrlToProcess}: ${insertError.message}.`);
              if (insertError.code === '23505') console.error(`Unique constraint violation for ${currentUrlToProcess}.`);
              globallyProcessedOrQueuedUrlsInThisRun.delete(currentUrlToProcess);
              continue;
            }
            console.log(`Initial record created for ${isDiscovered ? 'discovered ' : ''}URL: ${currentUrlToProcess} with status ${STATUS.PROCESSING_STARTED}`);
          } catch (e:any) {
            console.error(`Unexpected error during initial record insertion for ${currentUrlToProcess}: ${e.message}.`);
            globallyProcessedOrQueuedUrlsInThisRun.delete(currentUrlToProcess);
            continue;
          }

          // --- Step 2: Fetch Web Content (with retries) ---
          const webContentResult = await fetchWebContent(currentUrlToProcess);

          if (webContentResult.robotsTxtDisallowed) {
            console.log(`Skipping ${currentUrlToProcess} as fetching is disallowed by robots.txt.`);
            await updateSupabaseRecord(supabaseClient, currentUrlToProcess, {
              summary: 'Content fetching was disallowed by the website\'s robots.txt file.',
              status: STATUS.SKIPPED_ROBOTS,
              agent_error_message: 'robots.txt disallows fetching for user agent ' + OUR_USER_AGENT,
              agent_progress_message: 'Skipped due to robots.txt.',
            });
            continue;
          }

          if (webContentResult.error || !webContentResult.rawHtmlContent) {
            console.warn(`Could not fetch content or content was empty for ${currentUrlToProcess}. Error: ${webContentResult.error || 'No raw HTML content'}.`);
            await updateSupabaseRecord(supabaseClient, currentUrlToProcess, {
              summary: webContentResult.error || 'No raw HTML content was obtained. AI processing cannot proceed.',
              status: STATUS.ERROR_FETCHING,
              agent_error_message: webContentResult.error || 'Raw HTML content is null or empty.',
              agent_progress_message: 'Content fetching failed or returned empty.',
            });
            continue;
          }

          await updateSupabaseRecord(supabaseClient, currentUrlToProcess, {
            status: STATUS.CONTENT_FETCHED,
            agent_progress_message: `Successfully fetched raw HTML. Length: ${webContentResult.rawHtmlContent.length}.`,
            agent_error_message: null,
          });

          // --- Step 3 (was 4): Extract Main Content & Prepare for Link Discovery ---
          let discoveredLinksOnPage: string[] = [];
          if (webContentResult.extractedArticle) {
            discoveredLinksOnPage = webContentResult.extractedArticle.discoveredLinks || [];
            console.log(`Successfully extracted main content for ${currentUrlToProcess}. Title: "${webContentResult.extractedArticle.title}". Found ${discoveredLinksOnPage.length} links.`);
            await updateSupabaseRecord(supabaseClient, currentUrlToProcess, {
              title: webContentResult.extractedArticle.title,
              status: STATUS.CONTENT_EXTRACTED,
              agent_progress_message: `Main content extracted. Title: "${webContentResult.extractedArticle.title}". Links found: ${discoveredLinksOnPage.length}.`,
            });
          } else {
            console.warn(`ExtractedArticle object is null for ${currentUrlToProcess}, though rawHTML was present. This indicates a severe extraction issue.`);
            await updateSupabaseRecord(supabaseClient, currentUrlToProcess, {
              status: STATUS.ERROR_EXTRACTION,
              agent_progress_message: 'Critical error during content extraction phase (JSDOM/Readability setup or severe parsing error). No content or links extracted.',
              agent_error_message: 'ExtractedArticle object was null after successful HTML fetch.',
            });
            discoveredLinksOnPage = [];
          }

          // --- Step 4 (was 4.5): Process Discovered Links ---
          // Only process discovered links if this currentUrlToProcess is the initial site for this discovery branch,
          // OR if we haven't hit the link processing limit for this branch yet.
          const canProcessMoreLinksFromThisBranch = discoveredLinksProcessedCountForInitialSite < MAX_DISCOVERED_LINKS_PER_STRATEGY_SITE;

          if (discoveredLinksOnPage.length > 0 && canProcessMoreLinksFromThisBranch) {
            console.log(`Processing up to ${MAX_DISCOVERED_LINKS_PER_STRATEGY_SITE - discoveredLinksProcessedCountForInitialSite} discovered links from ${currentUrlToProcess} (Origin: ${initialSiteUrl})`);
            for (const discoveredLink of discoveredLinksOnPage) {
              if (discoveredLinksProcessedCountForInitialSite >= MAX_DISCOVERED_LINKS_PER_STRATEGY_SITE) {
                console.log(`Reached max discovered links (${MAX_DISCOVERED_LINKS_PER_STRATEGY_SITE}) for origin ${initialSiteUrl}. No more links will be queued from this page (${currentUrlToProcess}).`);
                break;
              }

              let discoveredLinkHostname: string | undefined;
              try {
                discoveredLinkHostname = new URL(discoveredLink).hostname;
              } catch (e: any) {
                console.warn(`Invalid discovered URL ${discoveredLink}: ${e.message}. Skipping.`);
                continue;
              }

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

              console.log(`Queueing discovered link: ${discoveredLink} (Origin: ${initialSiteUrl}, Original Keywords: ${originalStrategyKeywords.join(', ')})`);
              urlsToProcess.push({ url: discoveredLink, isDiscovered: true, originalStrategyKeywords }); // Pass original keywords
              globallyProcessedOrQueuedUrlsInThisRun.add(discoveredLink);
              // Increment count only for links that are NOT the initial strategy site itself being re-processed through discovery.
              // And only if this current URL is not the initial site.
              // This logic is tricky: we want to limit links *discovered from* the initial site and its children.
              // The count should apply to the branch originating from `initialSiteUrl`.
              discoveredLinksProcessedCountForInitialSite++;
            }
          } else if (discoveredLinksOnPage.length > 0 && !canProcessMoreLinksFromThisBranch) {
             console.log(`Limit for discovered links from origin ${initialSiteUrl} already met. No new links from ${currentUrlToProcess} will be queued.`);
          }


          // --- Step 5: Trigger AI Processing ---
          if (!webContentResult.extractedArticle?.content && !webContentResult.rawHtmlContent) {
             console.warn(`Skipping AI processing for ${currentUrlToProcess} as there is no content.`);
             await updateSupabaseRecord(supabaseClient, currentUrlToProcess, {
                status: STATUS.ERROR_EXTRACTION,
                agent_progress_message: 'No meaningful content found to send to AI.',
             });
             continue;
          }
          if (!webContentResult.extractedArticle?.content && webContentResult.extractedArticle?.title === 'Title not found') {
            console.warn(`Skipping AI processing for ${currentUrlToProcess} as main article content extraction failed, only got links/default title.`);
            await updateSupabaseRecord(supabaseClient, currentUrlToProcess, {
                status: STATUS.ERROR_EXTRACTION,
                agent_progress_message: 'Main article content not extracted by Readability; skipping AI processing.',
            });
            continue;
          }


          await updateSupabaseRecord(supabaseClient, currentUrlToProcess, {
            status: STATUS.AI_PROCESSING_INITIATED,
            agent_progress_message: `Content ready. Initiating AI processing. Extracted title: ${webContentResult.extractedArticle?.title || 'N/A'}.`,
            agent_error_message: null,
          });

          const processedContent = await triggerAIProcessing(
            processingId,
            currentUrlToProcess,
            originalStrategyKeywords.join(', ') // Use original keywords for AI processing
          );

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
            } else {
                console.log(`AI processing for ${currentUrlToProcess} resulted in status: ${processedContent.status}. Message: ${finalProgressMessage}`);
            }
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
        } // End while urlsToProcess
        if(iterationCount >= MAX_ITERATIONS_PER_INITIAL_SITE) {
            console.warn(`Max iterations (${MAX_ITERATIONS_PER_INITIAL_SITE}) reached for initial site ${initialSiteUrl}. Moving to next initial site or strategy.`);
            await sendNotification(
                `Agent Warning: Max Iterations Reached for Site`,
                `Processing for initial site ${initialSiteUrl} and its discovered links reached the maximum iteration limit (${MAX_ITERATIONS_PER_INITIAL_SITE}). This might indicate a loop or very deep crawl.`,
                false
            );
        }
      } // End for initialSiteUrl
    } // End for strategy
  } catch (mainLoopError: any) {
    console.error('[AGENT RUN] Critical error during main strategy processing loop:', mainLoopError);
  } catch (mainLoopError: any) {
    console.error('[AGENT RUN] Critical error during main strategy processing loop:', mainLoopError);
    await sendNotification(
        'Agent Run Failed: Error in Main Processing Loop',
        `The content curation agent encountered a critical error during the strategy processing loop.
It may have not processed all strategies or URLs.
Error: ${mainLoopError.message}\n\nStack: ${mainLoopError.stack}`,
        true
    );
    // Depending on desired behavior, you might re-throw or exit
    // process.exit(1); // Or allow to proceed to end of script if appropriate
  }
}

// Run the agent
if (require.main === module) {
  runAgent().catch(async error => { // Make catch async to await sendNotification
    console.error('Unhandled critical error at the top level of agent execution:', error);
    await sendNotification(
        'Agent Failed: Unhandled Top-Level Exception',
        `The content curation agent encountered an unhandled critical error and has terminated.
Error: ${error.message}\n\nStack: ${error.stack}`,
        true
    );
    process.exit(1);
  });
}

// Helper function to update a record in Supabase, creating it if it doesn't exist.
// This is a simplified upsert; Supabase has .upsert() but it requires more setup for conflict resolution.
// For this agent, we'll try to insert first, and if it conflicts (duplicate URL), then update.
// However, a more robust approach for this subtask is to assume an initial record is made
// and then only perform updates. The prompt implies creating an initial record.
// Let's refine `storeResultsInSupabase` to handle updates if a record for the URL exists,
// or insert if not. Or, better, ensure `runAgent` creates a placeholder first.

// For this step, let's assume `storeResultsInSupabase` will be enhanced or we add an `updateSupabaseRecord`
async function updateSupabaseRecord(supabaseClient: SupabaseClient, sourceUrl: string, updates: Partial<ProcessedContent> & { status: string, agent_progress_message?: string | null, agent_error_message?: string | null }) {
  console.log(`Updating Supabase record for ${sourceUrl} with status: ${updates.status}`);
  try {
    const { data, error } = await supabaseClient
      .from('curated_content')
      .update({
        ...updates, // Spread other fields from ProcessedContent type that might be updated
        status: updates.status,
        agent_progress_message: updates.agent_progress_message,
        agent_error_message: updates.agent_error_message,
        updated_at: new Date().toISOString(), // Explicitly set updated_at
      })
      .eq('source_url', sourceUrl)
      .select(); // Select the updated records

    if (error) {
      console.error(`Error updating Supabase record for ${sourceUrl}:`, error.message);
      // Consider if this error should halt the agent or just be logged
    } else if (data && data.length > 0) {
      console.log(`Supabase record updated successfully for ${sourceUrl}. New status: ${data[0].status}`);
    } else {
      console.warn(`No record found in Supabase to update for source_url: ${sourceUrl}. This might indicate an issue if an initial record was expected.`);
      // If no record was found to update, it might mean the initial insertion failed or was skipped.
      // For robustness, we could attempt an insert here as a fallback,
      // but ideally, the initial record creation should be reliable.
      // For now, just log a warning.
    }
  } catch (e: any) {
    console.error(`Unexpected error during Supabase update for ${sourceUrl}:`, e.message);
  }
}


// Export functions for potential testing, though this script is primarily for direct execution.
export {
    initializeSupabaseClient,
    fetchStrategiesFromSupabase,
    fetchWebContent, // Now returns WebContentFetchResult
    extractMainContent, // Newly added
    checkForDuplicates,
    triggerAIProcessing,
    storeResultsInSupabase,
    runAgent
};
