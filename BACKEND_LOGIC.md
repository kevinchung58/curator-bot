# Backend Logic: Content Curation Agent (`src/agent/agent-script.ts`)

## 1. Overview

The `agent-script.ts` is a Node.js script responsible for automated content curation. It operates by fetching predefined search strategies, discovering web content based on these strategies, processing the content (including extraction and AI-driven analysis via an external API), and storing the results and status updates in a Supabase database. It's designed to be run periodically by a scheduler (e.g., GitHub Actions, cron job).

## 2. Key Dependencies

The agent relies on several key libraries for its operations:

*   **`@supabase/supabase-js`**: For interacting with the Supabase database to fetch strategies and store curated content.
*   **`@mozilla/readability`**: Used to extract the main, readable content (like an article) from HTML pages, stripping away clutter.
*   **`jsdom`**: Provides a JavaScript DOM environment, necessary for Readability to parse HTML content as if it were in a browser.
*   **`robots-parser`**: Used to fetch and interpret `robots.txt` files to ensure the agent respects website crawling politeness rules.
*   **`node-fetch` (implicitly via global `fetch` in Node.js 18+)**: For making HTTP requests to fetch web content and `robots.txt` files.

## 3. Configuration

The agent's behavior is configured through environment variables and internal constants.

### Environment Variables

*   `SUPABASE_URL`: The URL of your Supabase project.
*   `SUPABASE_ANON_KEY`: The public anonymous key for your Supabase project.
*   `NEXT_PUBLIC_APP_URL`: The base URL of the Next.js application where the AI processing API endpoint (`/api/agent/process-content`) is hosted.
*   *(Conceptual for Notifications)*: `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASS`, `NOTIFICATION_EMAIL_FROM`, `NOTIFICATION_EMAIL_TO`, `SLACK_WEBHOOK_URL` (these would be needed if `sendNotification` is fully implemented).

### Internal Constants

*   **Fetch Retries & Timeouts:**
    *   `MAX_FETCH_RETRIES`: Number of times to retry fetching content from a URL on failure (Default: 3).
    *   `FETCH_RETRY_DELAY_MS`: Delay in milliseconds between fetch retries (Default: 1000ms).
    *   `FETCH_TIMEOUT_MS`: Timeout for each fetch attempt (Default: 15000ms).
*   **User Agent:**
    *   `OUR_USER_AGENT`: The user agent string the agent uses for HTTP requests (e.g., `ContentCuratorBot/1.0 (+http://yourprojecturl.com/botinfo)`).
*   **Status Constants (`STATUS` object):** A defined set of string constants representing the various states of content processing (see Status Management section).

## 4. Core Workflow (`runAgent` function)

The `runAgent` function orchestrates the entire content curation process:

1.  **Initialization:**
    *   Calls `initializeSupabaseClient()` to set up the Supabase client. If this fails, a critical notification is sent, and the agent exits.

2.  **Fetch Search Strategies:**
    *   Calls `fetchStrategiesFromSupabase()` to retrieve search strategies from the `search_strategies` table.
    *   If no strategies are found, a warning notification is sent, and the agent exits.

3.  **Iterate Through Strategies and URLs:**
    *   The agent loops through each strategy and then through each `targetSite` (URL) defined within that strategy.

4.  **Process Each URL:** For every URL, the following steps are performed:
    *   **Duplicate Check:** Calls `checkForDuplicates()` to see if the URL has already been successfully processed and stored in `curated_content`. If it's a duplicate, it's skipped.
    *   **Initial Record Creation:** If not a duplicate, an initial record is inserted into the `curated_content` table with a status of `STATUS.PROCESSING_STARTED`. This record is then updated throughout the subsequent steps.
    *   **Content Fetching (`fetchWebContent`):**
        *   **`robots.txt` Compliance:**
            *   The `robots.txt` file for the target domain is fetched using `getRobotsTxtUrl()`.
            *   `robots-parser` is used to check if `OUR_USER_AGENT` is allowed to fetch the target URL.
            *   If disallowed, the status is updated to `STATUS.SKIPPED_ROBOTS`, and processing for this URL stops.
        *   **Fetch with Retries:** If allowed, the actual content URL is fetched.
            *   This fetch operation includes a retry mechanism (`MAX_FETCH_RETRIES`, `FETCH_RETRY_DELAY_MS`) for transient network errors or server-side issues (5xx errors).
            *   A timeout (`FETCH_TIMEOUT_MS`) is applied to each fetch attempt.
            *   If fetching fails after all retries, the status is updated to `STATUS.ERROR_FETCHING`, and processing for this URL stops.
        *   **Content Extraction (`extractMainContent`):**
            *   If raw HTML content is successfully fetched, its status is updated to `STATUS.CONTENT_FETCHED`.
            *   `extractMainContent()` is called, which uses `JSDOM` to parse the HTML and `Readability` to extract the main article content (title, text, simplified HTML, excerpt, byline).
            *   Status is updated to `STATUS.CONTENT_EXTRACTED` on success or `STATUS.ERROR_EXTRACTION` on failure. The extracted title may update the record in the database.
    *   **AI Processing (`triggerAIProcessing`):**
        *   If content fetching and (optionally) extraction were successful, the status is updated to `STATUS.AI_PROCESSING_INITIATED`.
        *   `triggerAIProcessing()` is called, making a POST request to the Next.js API endpoint (`${NEXT_PUBLIC_APP_URL}/api/agent/process-content`). This endpoint is expected to handle further AI-driven analysis (e.g., summarization, tagging) using Genkit or a similar AI framework.
        *   The `articleUrl` and `topic` (from strategy keywords) are passed to the API.
    *   **Store/Update Results (`updateSupabaseRecord`):**
        *   Based on the response from `triggerAIProcessing` (or if it failed), `updateSupabaseRecord()` is called to update the record in `curated_content`.
        *   This includes setting the final `status` (e.g., `STATUS.AI_PROCESSING_SUCCESSFUL` or `STATUS.AI_PROCESSING_FAILED`), storing the AI-generated title, summary, tags, image URL (if any), and relevant progress or error messages.

The agent includes a top-level `try...catch` around the main strategy processing loop and another around the `runAgent()` call itself to catch unhandled exceptions and trigger critical notifications via `sendNotification`.

## 5. Key Functions

*   **`initializeSupabaseClient()`**: Initializes and returns the Supabase client instance using environment variables. Exits on failure.
*   **`fetchStrategiesFromSupabase(client)`**: Fetches content curation strategies from the `search_strategies` table in Supabase. Returns a default strategy if none are found or on error.
*   **`getRobotsTxtUrl(websiteUrl)`**: Constructs the full URL for a website's `robots.txt` file.
*   **`extractMainContent(htmlContent, url)`**: Uses `JSDOM` and `@mozilla/readability` to parse HTML and extract the main article content (title, text, simplified HTML, etc.). Returns an `ExtractedArticle` object or `null`.
*   **`fetchWebContent(targetUrl)`**: Fetches web content from a URL. Handles `robots.txt` checks, implements retry logic with timeouts for fetching the main content, and calls `extractMainContent`. Returns a `WebContentFetchResult` object containing raw HTML, extracted article, and error/status flags.
*   **`checkForDuplicates(client, sourceUrl)`**: Checks if a given `sourceUrl` already exists in the `curated_content` table to avoid reprocessing.
*   **`triggerAIProcessing(articleId, articleUrl, topic)`**: Calls the external Next.js API endpoint (`/api/agent/process-content`) to perform AI-based processing on the content of the given URL. Returns a `ProcessedContent` object or `null`.
*   **`updateSupabaseRecord(client, sourceUrl, updates)`**: Updates an existing record in the `curated_content` table for the given `sourceUrl` with new data (status, messages, AI results, etc.).
*   **`sendNotification(subject, body, isCritical)`**: A stub function for sending notifications (currently logs to console). Intended for critical errors or operational warnings.

## 6. Status Management

The `status` field in the `curated_content` table is crucial for tracking the state of each processed URL. The agent uses a predefined set of status constants (defined in the `STATUS` object):

*   `STATUS.PROCESSING_STARTED`: Agent has picked up the URL.
*   `STATUS.SKIPPED_ROBOTS`: Fetching disallowed by `robots.txt`.
*   `STATUS.ERROR_FETCHING`: Error occurred during web content fetch.
*   `STATUS.CONTENT_FETCHED`: Raw HTML successfully fetched.
*   `STATUS.CONTENT_EXTRACTED`: Main content successfully extracted by Readability.
*   `STATUS.ERROR_EXTRACTION`: Readability failed to extract main content.
*   `STATUS.AI_PROCESSING_INITIATED`: Call to AI processing API started.
*   `STATUS.AI_PROCESSING_SUCCESSFUL`: AI processing completed successfully.
*   `STATUS.AI_PROCESSING_FAILED`: AI processing API returned an error or failed.
*   `STATUS.COMPLETED`: Often synonymous with `AI_PROCESSING_SUCCESSFUL`, indicating end of successful processing.
*   `STATUS.ERROR`: A generic error status for unexpected issues not covered by more specific error statuses.

Each step in the `runAgent` workflow updates the status in the Supabase record, along with `agent_progress_message` and `agent_error_message` fields to provide detailed tracing.

## 7. Error Handling & Notifications

*   **Retry Logic:** `fetchWebContent` implements a retry mechanism with delays and timeouts for fetching the main content, making it resilient to transient network issues.
*   **Graceful Exits & Continuations:**
    *   Individual URL processing failures (e.g., fetch error, AI processing error) are logged to Supabase for that specific URL, and the agent continues with the next URL or strategy.
    *   Failure to insert an initial record for a URL (a critical local DB step) will cause the agent to skip that URL and continue.
*   **Critical Error Notifications:**
    *   The `sendNotification` function (currently a logging stub) is called for:
        *   Failure to initialize the Supabase client.
        *   Critical errors during the main strategy processing loop.
        *   Any unhandled top-level exceptions that would terminate the agent.
    *   A non-critical warning notification is sent if no search strategies are found.
*   **Supabase Errors:** Errors during Supabase operations (insert, update) are caught, logged to the console, and for individual record updates, the agent typically continues processing.

## 8. Supabase Table Interactions

The agent primarily interacts with two Supabase tables:

*   **`search_strategies`**:
    *   **Read:** Fetches records defining what content to look for (keywords, target sites/domains).
    *   Assumed schema includes fields like `keywords` (array of strings or string), `target_sites` (array of strings - URLs), `content_types_to_monitor`.

*   **`curated_content`**:
    *   **Write (Insert & Update):** This is the main table where the agent stores its findings and progress.
    *   An initial record is inserted when a new URL begins processing.
    *   This record is then repeatedly updated with status changes, progress messages, error messages, and eventually, the processed content (title, summary, tags, image URL) from the AI.
    *   Key columns used by the agent: `source_url` (UNIQUE), `title`, `summary`, `tags`, `status`, `agent_progress_message`, `agent_error_message`, `agent_id` (internal processing ID), `created_at`, `updated_at`, `image_url`, `image_status`, `image_ai_hint`, `image_error_message`.
