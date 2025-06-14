
// TODO: Investigate and fix agent script issues.
// The agent was previously run on a cron schedule and consistently failed.
// Issues may include:
//  - Missing or incorrect Supabase environment variables (SUPABASE_URL, SUPABASE_ANON_KEY)
//  - Other potential issues preventing the agent from completing its tasks.
// The cron workflow file (.github/workflows/cron.yml) has been deleted for now.
// This script needs to be fixed before re-enabling any automated execution.

/**
 * @fileOverview Content Curator Agent script.
 * This script is intended to be run by a scheduler (e.g., GitHub Actions).
 * It fetches content curation strategies, discovers new content,
 * processes it using AI (by calling a Next.js API endpoint), and stores the results in Supabase.
 */

import { config } from 'dotenv';
config(); // Load .env file for local development/testing of this script

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { ProcessedContent, SearchStrategy } from '@/lib/definitions'; // Adjust path as needed

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
async function fetchWebContent(url: string): Promise<string | null> {
  console.log(`Fetching web content from: ${url}`);
  try {
    // Using global fetch, available in Node.js 18+ (which GH Actions runner uses)
    const response = await fetch(url, { 
      headers: { 
        'User-Agent': 'ContentCuratorBot/1.0 (+http://yourprojecturl.com/botinfo)' 
      } 
    });
    if (!response.ok) {
      console.error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
      return null;
    }
    const htmlContent = await response.text();
    console.log(`Successfully fetched content from ${url}. Length: ${htmlContent.length}`);
    return htmlContent;
    // NOTE: This agent script fetches raw content. The actual parsing/extraction of main article text
    // is handled by the Genkit flow called via the Next.js API.
    // If the agent needed to find *new links* on a page, more advanced parsing (e.g. with Cheerio) would be needed here.
  } catch (error: any) {
    console.error(`Error fetching content from ${url}:`, error.message);
    return null;
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
  let supabaseClient;
  try {
    supabaseClient = await initializeSupabaseClient();
  } catch (error: any) {
    console.error("Agent critical error: Failed to initialize Supabase. Agent cannot continue.", error.message);
    process.exit(1); // Exit if Supabase can't be initialized
  }

  const strategies = await fetchStrategiesFromSupabase(supabaseClient);

  if (!strategies || strategies.length === 0) {
    console.log('No search strategies found or fetched. Agent will exit.');
    return;
  }
  console.log(`Processing ${strategies.length} strategies.`);

  for (const strategy of strategies) {
    console.log(`\nProcessing strategy: Keywords - ${(strategy.keywords || []).join(', ')}, Sites: ${(strategy.targetSites || []).join(', ')}`);
    
    // This part needs to be more sophisticated.
    // For each strategy, it should iterate `targetSites`.
    // For each `targetSite`, it might need to scrape that site to find individual article URLs.
    // Or, if `targetSites` are RSS feeds, parse them.
    // Or, use `keywords` to search via a search engine API (if available/configured).
    
    // Simplified loop: process each targetSite URL as if it's a direct article URL.
    for (const siteUrl of (strategy.targetSites || [])) {
      console.log(`\n---\nProcessing target site/URL: ${siteUrl}`);
      const articleUrlToProcess = siteUrl; // In this simplified version.

      const isDuplicate = await checkForDuplicates(supabaseClient, articleUrlToProcess);
      if (isDuplicate) {
        console.log(`Skipping already processed URL: ${articleUrlToProcess}`);
        continue;
      }

      // Agent generates a unique ID for this processing attempt.
      // This ID could be passed to the API and then used by the ProcessedContent object.
      const processingId = `agent-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      // The AI processing step (called via Next.js API) should handle fetching the content based on URL.
      // No need for explicit `fetchWebContent(articleUrlToProcess)` here unless the agent itself
      // needs to pre-filter or extract links before deciding to process.
      const processedContent = await triggerAIProcessing(processingId, articleUrlToProcess, (strategy.keywords || ['General']).join(', '));
      
      if (processedContent) {
        if (processedContent.status === 'error') {
          console.warn(`AI Processing for ${articleUrlToProcess} resulted in an error: ${processedContent.errorMessage || processedContent.progressMessage}`);
          // Optionally, store error information or take other actions for failed processing.
          // For now, we might still store it to log the attempt and failure.
          await storeResultsInSupabase(supabaseClient, processedContent);
        } else if (processedContent.status === 'processed') {
          console.log(`Successfully processed content for URL: ${articleUrlToProcess}, Title: ${processedContent.title}`);
          await storeResultsInSupabase(supabaseClient, processedContent);
        } else {
           console.log(`Content processing for ${articleUrlToProcess} resulted in status: ${processedContent.status}. Message: ${processedContent.progressMessage}`);
           // Decide if other statuses also need to be stored.
           // For now, storing it to capture the outcome.
           await storeResultsInSupabase(supabaseClient, processedContent);
        }
      } else {
        console.error(`Failed to get any response from AI processing trigger for URL: ${articleUrlToProcess}. No content to store.`);
      }
      console.log(`---`);
    }
  }

  console.log(`Content Curator Agent finished at: ${new Date().toISOString()}`);
}

// Run the agent
if (require.main === module) {
  runAgent().catch(error => {
    console.error('Unhandled critical error in agent execution:', error);
    process.exit(1);
  });
}

// Export functions for potential testing, though this script is primarily for direct execution.
export {
    initializeSupabaseClient,
    fetchStrategiesFromSupabase,
    fetchWebContent,
    checkForDuplicates,
    triggerAIProcessing,
    storeResultsInSupabase,
    runAgent
};
