
/**
 * @fileOverview Content Curator Agent script.
 * This script is intended to be run by a scheduler (e.g., GitHub Actions).
 * It fetches content curation strategies, discovers new content,
 * processes it using AI, and stores the results.
 */

import { config } from 'dotenv';
config(); // Load .env file for local development

// import { createClient } from '@supabase/supabase-js';
// import type { ProcessedContent, SearchStrategy } from '@/lib/definitions'; // Adjust path as needed

// Placeholder for Supabase client
// let supabase: any;

/**
 * Initializes the Supabase client.
 */
async function initializeSupabaseClient() {
  console.log('Initializing Supabase client...');
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Supabase URL or Anon Key is not defined in environment variables.');
    throw new Error('Supabase environment variables not set.');
  }
  // supabase = createClient(supabaseUrl, supabaseAnonKey);
  console.log('Supabase client initialized (placeholder).');
  // Return a mock client for now
  return {
    from: (tableName: string) => ({
      select: async () => { console.log(`Mock Supabase: SELECT from ${tableName}`); return { data: [], error: null }; },
      insert: async (data: any) => { console.log(`Mock Supabase: INSERT into ${tableName}`, data); return { data: [data], error: null }; },
      eq: (column: string, value: any) => ({
        select: async () => { console.log(`Mock Supabase: SELECT from table where ${column}=${value}`); return {data: [], error: null};}
      })
    })
  };
}

/**
 * Fetches search strategies from Supabase.
 * @param {any} supabaseClient - The Supabase client instance.
 * @returns {Promise<any[]>} - Array of search strategies.
 */
async function fetchStrategiesFromSupabase(supabaseClient: any): Promise<any[]> {
  console.log('Fetching search strategies from Supabase...');
  // const { data, error } = await supabaseClient.from('search_strategies').select('*');
  // if (error) {
  //   console.error('Error fetching strategies:', error);
  //   return [];
  // }
  // console.log(`Fetched ${data?.length || 0} strategies.`);
  // return data || [];
  console.log('Mock: Fetched 0 strategies.');
  return [{ keywords: ['AI ethics'], targetSites: ['https://www.technologyreview.com/topic/artificial-intelligence/ethics/'], contentTypesToMonitor: ['articles'] }]; // Mock strategy
}

/**
 * Fetches raw HTML content from a given URL.
 * @param {string} url - The URL to fetch.
 * @returns {Promise<string | null>} - The HTML content or null if failed.
 */
async function fetchWebContent(url: string): Promise<string | null> {
  console.log(`Fetching web content from: ${url}`);
  try {
    const response = await fetch(url, { headers: { 'User-Agent': 'ContentCuratorBot/1.0' } });
    if (!response.ok) {
      console.error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
      return null;
    }
    const htmlContent = await response.text();
    console.log(`Successfully fetched content from ${url}. Length: ${htmlContent.length}`);
    return htmlContent;
  } catch (error: any) {
    console.error(`Error fetching content from ${url}:`, error.message);
    return null;
  }
}

/**
 * Checks for duplicate content in Supabase by URL.
 * @param {any} supabaseClient - The Supabase client instance.
 * @param {string} sourceUrl - The URL of the content to check.
 * @returns {Promise<boolean>} - True if URL already exists, false otherwise.
 */
async function checkForDuplicates(supabaseClient: any, sourceUrl: string): Promise<boolean> {
  console.log(`Checking for duplicates for URL: ${sourceUrl}`);
  // const { data, error } = await supabaseClient
  //   .from('curated_content')
  //   .select('id')
  //   .eq('source_url', sourceUrl)
  //   .limit(1);

  // if (error) {
  //   console.error('Error checking for duplicates:', error);
  //   return false; // Assume not duplicate on error to allow processing attempt
  // }
  // const isDuplicate = data && data.length > 0;
  // console.log(isDuplicate ? 'URL is a duplicate.' : 'URL is not a duplicate.');
  // return isDuplicate;
  console.log('Mock: URL is not a duplicate.');
  return false;
}

/**
 * Triggers AI processing for the discovered content.
 * This function would typically make an API call to the Next.js backend
 * which then invokes the Genkit flow.
 * @param {string} articleUrl - The URL of the article.
 * @param {string} topic - The topic for content processing.
 * @returns {Promise<any | null>} - The processed content or null if failed.
 */
async function triggerAIProcessing(articleUrl: string, topic: string): Promise<any | null> {
  console.log(`Triggering AI processing for URL: ${articleUrl}, Topic: ${topic}`);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    console.error('NEXT_PUBLIC_APP_URL is not set. Cannot call AI processing API.');
    // As a fallback for this initial version, we can simulate what might happen or return a mock error.
    // In a real scenario, this would be a critical failure.
    // For now, let's return a mock "error" structure similar to what processDiscoveredContent action might return.
    return {
        id: `mock-${Date.now()}`,
        sourceUrl: articleUrl,
        title: 'AI Processing Skipped',
        summary: 'NEXT_PUBLIC_APP_URL not configured. AI processing API endpoint could not be called by the agent.',
        tags: ['error', 'agent-config-error'],
        status: 'error',
        progressMessage: 'AI processing skipped due to missing NEXT_PUBLIC_APP_URL.',
        errorMessage: 'NEXT_PUBLIC_APP_URL not configured for agent API calls.',
        imageStatus: 'none',
    };
  }

  // TODO: Implement an API endpoint in the Next.js app (e.g., /api/agent/process-content)
  // that accepts { articleUrl, topic } and internally calls the `processDiscoveredContent` server action
  // or directly the `generateContentSummary` Genkit flow.
  // The agent script would then POST to this endpoint.

  // Example of how the API call might look:
  /*
  try {
    const response = await fetch(`${appUrl}/api/agent/process-content`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ articleId: `agent-${Date.now()}`, articleUrl, topic }), // articleId could be generated here or by API
    });
    if (!response.ok) {
      const errorData = await response.text();
      console.error(`AI Processing API error: ${response.status}`, errorData);
      return null;
    }
    const processedData = await response.json();
    console.log('AI processing successful:', processedData.processedContent?.title);
    return processedData.processedContent; // Assuming the API returns a structure similar to ProcessContentState
  } catch (error: any) {
    console.error('Error calling AI processing API:', error.message);
    return null;
  }
  */
  console.log('Mock AI processing: Returning mock processed data.');
  return {
    id: `agent-${Date.now()}`,
    title: `Mock Title for ${articleUrl.substring(0,30)}`,
    summary: `This is a mock summary for the article found at ${articleUrl}, related to the topic: ${topic}. Processed by the agent.`,
    tags: ['mock', 'agent-processed', topic.toLowerCase().replace(/\s+/g, '-')],
    sourceUrl: articleUrl,
    status: 'processed',
    progressMessage: 'Successfully processed by mock AI.',
    imageStatus: 'none',
  };
}

/**
 * Stores the processed content results in Supabase.
 * @param {any} supabaseClient - The Supabase client instance.
 * @param {any} processedData - The content data to store.
 */
async function storeResultsInSupabase(supabaseClient: any, processedData: any) {
  console.log(`Storing results in Supabase for title: ${processedData.title}`);
  // const { data, error } = await supabaseClient
  //   .from('curated_content')
  //   .insert([
  //     {
  //       // id: processedData.id, // Supabase might autogen if not provided
  //       title: processedData.title,
  //       summary: processedData.summary,
  //       tags: processedData.tags,
  //       source_url: processedData.sourceUrl,
  //       status: processedData.status, // e.g., 'processed_by_agent'
  //       // created_at: new Date().toISOString(), // Supabase might handle this
  //       raw_web_content_if_needed: processedData.rawContent, // if storing raw content
  //       // any other fields from ProcessedContent definition
  //     },
  //   ]);

  // if (error) {
  //   console.error('Error storing results in Supabase:', error);
  // } else {
  //   console.log('Results stored successfully in Supabase:', data);
  // }
  console.log('Mock: Results stored in Supabase.');
}


/**
 * Main function for the agent.
 */
async function runAgent() {
  console.log('Content Curator Agent started running...');
  let supabaseClient;
  try {
    supabaseClient = await initializeSupabaseClient();
  } catch (error) {
    console.error("Failed to initialize. Agent cannot continue.", error);
    return;
  }

  const strategies = await fetchStrategiesFromSupabase(supabaseClient);

  if (!strategies || strategies.length === 0) {
    console.log('No search strategies found. Agent will exit.');
    return;
  }

  for (const strategy of strategies) {
    console.log(`Processing strategy: Keywords - ${strategy.keywords.join(', ')}`);
    // For each strategy, you might iterate through target sites or use keywords for broader search
    // This example will just use the first target site if available.
    if (strategy.targetSites && strategy.targetSites.length > 0) {
      const siteUrl = strategy.targetSites[0]; // Simplified: just process the first target site
      console.log(`Attempting to scan site: ${siteUrl} (Note: This is a placeholder for actual site scanning/scraping)`);
      
      // In a real scenario, you'd scrape siteUrl to find multiple article links.
      // For this example, we'll treat the siteUrl itself as an article to process.
      const articleUrlToProcess = siteUrl; 

      const isDuplicate = await checkForDuplicates(supabaseClient, articleUrlToProcess);
      if (isDuplicate) {
        console.log(`Skipping already processed URL: ${articleUrlToProcess}`);
        continue;
      }

      // Fetching raw content (simplified, actual scraping is more complex)
      // const rawContent = await fetchWebContent(articleUrlToProcess);
      // if (!rawContent) {
      //   console.log(`Could not fetch content for ${articleUrlToProcess}. Skipping.`);
      //   continue;
      // }
      // The AI processing step should handle fetching based on URL.

      const processedContent = await triggerAIProcessing(articleUrlToProcess, strategy.keywords.join(', ') || 'General'); // Use keywords as topic
      if (processedContent && processedContent.status !== 'error') {
        await storeResultsInSupabase(supabaseClient, processedContent);
      } else {
        console.log(`Failed to process content or AI processing returned an error for URL: ${articleUrlToProcess}`);
        if (processedContent && processedContent.errorMessage) {
            console.error(`AI Error for ${articleUrlToProcess}: ${processedContent.errorMessage}`);
        }
      }
    }
  }

  console.log('Content Curator Agent finished.');
}

// Run the agent
runAgent().catch(error => {
  console.error('Unhandled error in agent:', error);
  process.exit(1);
});
