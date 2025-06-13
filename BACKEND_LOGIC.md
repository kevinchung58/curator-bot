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
*   **Email Notifications:**
    *   `EMAIL_HOST`: SMTP server host for sending email notifications.
    *   `EMAIL_PORT`: SMTP server port (e.g., 587 for TLS, 465 for SSL).
    *   `EMAIL_USER`: Username for SMTP authentication.
    *   `EMAIL_PASS`: Password for SMTP authentication.
    *   `EMAIL_SECURE`: Set to `'true'` if using SSL (typically port 465), otherwise `false` (for STARTTLS on port 587/25).
    *   `NOTIFICATION_EMAIL_FROM`: The "From" address for notification emails (e.g., `agent@example.com`).
    *   `NOTIFICATION_EMAIL_TO`: The recipient email address(es) for agent notifications.
*   `UPTIME_KUMA_PUSH_URL` (Optional): The full URL to send a GET request to for Uptime Kuma heartbeat monitoring. If set, the agent will ping this URL upon successful completion of its run.

### Internal Constants

*   **Fetch Retries & Timeouts (for external web content):**
    *   `MAX_FETCH_RETRIES`: Number of times to retry fetching content from a URL on failure (Default: 3).
    *   `FETCH_RETRY_DELAY_MS`: Delay in milliseconds between fetch retries (Default: 1000ms).
    *   `FETCH_TIMEOUT_MS`: Timeout for each fetch attempt (Default: 15000ms).
*   **API Call Retries & Timeouts (for internal AI processing API):**
    *   `MAX_API_CALL_RETRIES`: Number of times to retry the API call to the Next.js endpoint (Default: 3).
    *   `API_CALL_RETRY_DELAY_MS`: Delay in milliseconds between API call retries (Default: 2000ms).
    *   `API_CALL_TIMEOUT_MS`: Timeout for each individual API call attempt (Default: 20000ms).
*   **Heartbeat Configuration:**
    *   `HEARTBEAT_TIMEOUT_MS`: Timeout in milliseconds for the Uptime Kuma heartbeat ping (Default: 5000ms).
*   **User Agent:**
    *   `OUR_USER_AGENT`: The user agent string the agent uses for HTTP requests (e.g., `ContentCuratorBot/1.0 (+http://yourprojecturl.com/botinfo)`).
*   **Link Discovery Configuration:**
    *   `MAX_DISCOVERED_LINKS_PER_STRATEGY_SITE`: Maximum number of new links to process that are discovered from a single initial strategy site and its subsequent child pages (Default: 10).
    *   `STAY_ON_SAME_DOMAIN`: Boolean flag to control if discovered links must be on the same domain as their originating `initialSiteUrl` from the strategy (Default: `true`).
*   **Status Constants (`STATUS` object):** A defined set of string constants representing the various states of content processing (see Status Management section).

## 4. Core Workflow (`runAgent` function)

The `runAgent` function orchestrates the entire content curation process:

1.  **Initialization:**
    *   Calls `initializeSupabaseClient()` to set up the Supabase client. If this fails, a critical notification is sent, and the agent exits.

2.  **Fetch Search Strategies:**
    *   Calls `fetchStrategiesFromSupabase()` to retrieve search strategies from the `search_strategies` table.
    *   If no strategies are found, a warning notification is sent, and the agent exits.
    *   Initializes a global set `globallyProcessedOrQueuedUrlsInThisRun` to track all URLs encountered during the current agent run to prevent redundant processing.

3.  **Iterate Through Strategies and Process URL Queue:**
    *   The agent loops through each `strategy`.
    *   For each `strategy`, it then iterates through each `initialSiteUrl` listed in `strategy.targetSites`.
    *   A processing queue (`urlsToProcess`) is initialized for each `initialSiteUrl`, starting with the `initialSiteUrl` itself. Each item in this queue is an object: `{ url: string; isDiscovered: boolean; originalStrategyKeywords: string[]; }`.
    *   A `while` loop continues as long as there are URLs in `urlsToProcess` (and safety iteration limits are not met).

4.  **Process Each URL from the Queue (`currentUrlToProcess`):**
    *   **Global Run Check:** The URL is first checked against `globallyProcessedOrQueuedUrlsInThisRun`. If already present (and not an `initialSiteUrl` being processed for the first time in its specific strategy context), it's skipped. Otherwise, it's added to this global set.
    *   **Supabase Duplicate Check:** Calls `checkForDuplicates()` to see if the URL already exists in the `curated_content` table (i.e., processed in a *previous* agent run). If so, it's skipped.
    *   **Initial Record Creation:** If not a duplicate, an initial record is inserted into `curated_content`.
        *   The `status` is set to `STATUS.PROCESSING_STARTED`.
        *   If the URL `isDiscovered`, a `'discovered'` tag is added to the `originalStrategyKeywords` inherited from its originating strategy.
    *   **Content Fetching (`fetchWebContent`):**
        *   **`robots.txt` Compliance:**
            *   The `robots.txt` file for the target domain is fetched using `getRobotsTxtUrl()`.
            *   `robots-parser` is used to check if `OUR_USER_AGENT` is allowed to fetch the target URL.
            *   If disallowed, the status is updated to `STATUS.SKIPPED_ROBOTS`, and processing for this URL stops.
        *   **Fetch with Retries:** If allowed, the actual content URL is fetched.
            *   This fetch operation includes a retry mechanism (`MAX_FETCH_RETRIES`, `FETCH_RETRY_DELAY_MS`) for transient network errors or server-side issues (5xx errors).
            *   A timeout (`FETCH_TIMEOUT_MS`) is applied to each fetch attempt.
            *   If fetching fails after all retries, the status is updated to `STATUS.ERROR_FETCHING`, and processing for this URL stops.
        *   **Content & Link Extraction (`extractMainContent`):**
            *   If raw HTML content is successfully fetched, its status is updated to `STATUS.CONTENT_FETCHED`.
            *   `extractMainContent()` is called. This function now not only extracts the main article (using JSDOM and Readability) but also discovers all valid hyperlinks (`<a>` tags) on the page via `extractLinksFromHtml`. These links are resolved to absolute URLs and filtered (protocol, basic file types).
            *   The result (`ExtractedArticle` object) includes the main content (title, text, etc.) and an array of `discoveredLinks`.
            *   Status is updated to `STATUS.CONTENT_EXTRACTED` on success or `STATUS.ERROR_EXTRACTION` on failure. The extracted title may update the record.
        *   **Link Discovery and Queueing:**
            *   If `discoveredLinks` are found in the `ExtractedArticle` object:
                *   Each link is checked against several conditions before being added to the `urlsToProcess` queue for the *current* `initialSiteUrl`'s discovery branch.
                *   **Domain Check:** If `STAY_ON_SAME_DOMAIN` is true, links to different domains than the `initialSiteUrl`'s domain are skipped.
                *   **Global Run Check:** Links already in `globallyProcessedOrQueuedUrlsInThisRun` are skipped.
                *   **Limit Check:** If the number of discovered links processed for the current `initialSiteUrl`'s branch (`discoveredLinksProcessedCountForInitialSite`) has reached `MAX_DISCOVERED_LINKS_PER_STRATEGY_SITE`, no more links from the current page are queued.
                *   **Supabase Duplicate Check:** Discovered links are checked against `curated_content` via `checkForDuplicates()` and skipped if already present.
                *   Valid new links are added to `urlsToProcess` as objects `{ url: discoveredLink, isDiscovered: true, originalStrategyKeywords: currentUrlObject.originalStrategyKeywords }`, and also to `globallyProcessedOrQueuedUrlsInThisRun`. The `discoveredLinksProcessedCountForInitialSite` is incremented.
    *   **AI Processing (`triggerAIProcessing`):**
        *   If content was suitable for AI processing (e.g., not an empty extraction), the status is updated to `STATUS.AI_PROCESSING_INITIATED`.
        *   `triggerAIProcessing()` is called, passing the `currentUrlToProcess` and its `originalStrategyKeywords`.
    *   **Store/Update Results (`updateSupabaseRecord`):**
        *   Based on the response from `triggerAIProcessing` (or if it failed), `updateSupabaseRecord()` is called to update the record in `curated_content`.
        *   This includes setting the final `status` (e.g., `STATUS.AI_PROCESSING_SUCCESSFUL` or `STATUS.AI_PROCESSING_FAILED`), storing the AI-generated title, summary, tags, image URL (if any), and relevant progress or error messages.

The agent includes a top-level `try...catch` around the main strategy processing loop and another around the `runAgent()` call itself to catch unhandled exceptions and trigger critical notifications via `sendNotification`.

## 5. Link Discovery and Processing

A significant feature of the agent is its ability to discover and process hyperlinks found within fetched web pages. This allows for a controlled, shallow crawl starting from the initial strategy sites.

*   **Extraction:** Link extraction occurs within the `extractMainContent` function. After parsing the HTML with `JSDOM`, an internal helper `extractLinksFromHtml` is called. This helper:
    *   Finds all `<a>` elements.
    *   Retrieves `href` attributes.
    *   Resolves relative URLs to absolute ones using the page's base URL.
    *   Filters links to keep only `http:` or `https:` protocols.
    *   Applies a basic filter to exclude common non-content file types (e.g., `.css`, `.js`, `.png`, `.pdf`).
    *   Ensures link uniqueness.
    *   The discovered links are returned as part of the `ExtractedArticle` object.

*   **Queueing and Processing in `runAgent`:**
    *   When `runAgent` processes a URL (either an initial strategy site or a previously discovered link), it retrieves the `discoveredLinks` after `fetchWebContent`.
    *   These links are then subject to several checks before being added to the current processing queue (`urlsToProcess`):
        1.  **Domain Restriction (`STAY_ON_SAME_DOMAIN`):** If enabled, links pointing to a different hostname than the original `initialSiteUrl` (from the strategy) are ignored. This keeps the discovery focused.
        2.  **Global Uniqueness for Current Run:** Links already present in `globallyProcessedOrQueuedUrlsInThisRun` (meaning they've been processed or queued in the current agent execution, possibly from another strategy or discovery path) are ignored to prevent redundant work and cycles within the same run.
        3.  **Per-Strategy Site Limit (`MAX_DISCOVERED_LINKS_PER_STRATEGY_SITE`):** A counter tracks how many new links have been queued that originated from the current `initialSiteUrl`'s discovery path. Once this limit is reached, no more links from that specific discovery branch are added from subsequent pages in that branch.
        4.  **Supabase Duplicate Check:** `checkForDuplicates` ensures the link hasn't been successfully processed in a *previous* agent run.
    *   Links that pass all these checks are added to the `urlsToProcess` queue as objects `{ url: discoveredLink, isDiscovered: true, originalStrategyKeywords: ... }`. The `isDiscovered: true` flag and inherited `originalStrategyKeywords` allow for differentiated processing or tagging.

*   **Contextual Tagging:** When an initial record is created in Supabase for a discovered link, a `'discovered'` tag is automatically added to its tags, along with the keywords from the strategy that led to its discovery.

This discovery mechanism allows the agent to expand its reach beyond the initial seed URLs in a controlled manner, finding potentially relevant related content.

## 6. Key Functions

*   **`initializeSupabaseClient()`**: Initializes and returns the Supabase client instance using environment variables. Exits on failure.
*   **`fetchStrategiesFromSupabase(client)`**: Fetches content curation strategies from the `search_strategies` table in Supabase. Returns a default strategy if none are found or on error.
*   **`getRobotsTxtUrl(websiteUrl)`**: Constructs the full URL for a website's `robots.txt` file.
*   **`extractLinksFromHtml(dom, baseUrl)`**: (Internal helper) Extracts, resolves, and filters hyperlinks from a JSDOM object.
*   **`extractMainContent(htmlContent, url)`**: Uses `JSDOM` to parse HTML. It then uses `@mozilla/readability` to extract the main article content and calls `extractLinksFromHtml` to discover hyperlinks from the page. Returns an `ExtractedArticle` object (which includes `discoveredLinks`) or `null` on critical parsing errors. It attempts to return a minimal object with links even if full article extraction fails.
*   **`fetchWebContent(targetUrl)`**: Fetches web content from a URL. Handles `robots.txt` checks, implements retry logic with timeouts for fetching the main content, and calls `extractMainContent`. Returns a `WebContentFetchResult` object containing raw HTML, the `ExtractedArticle` (with discovered links), and error/status flags.
*   **`checkForDuplicates(client, sourceUrl)`**: Checks if a given `sourceUrl` already exists in the `curated_content` table to avoid reprocessing.
*   **`triggerAIProcessing(articleId, articleUrl, topic)`**: Calls the external Next.js API endpoint (`/api/agent/process-content`) to perform AI-based processing on the content of the given URL. Receives `originalStrategyKeywords` as `topic`. Returns a `ProcessedContent` object or `null`. It now implements a retry mechanism (similar to `fetchWebContent`) for the `fetch` call to the Next.js API endpoint. This includes retrying on network errors and specific server-side HTTP status codes (500, 502, 503, 504), using `MAX_API_CALL_RETRIES`, `API_CALL_RETRY_DELAY_MS`, and `API_CALL_TIMEOUT_MS`. Application-level errors returned by the API (e.g., AI model failure indicated in JSON response) or client-side HTTP errors (4xx) are not retried.
*   **`updateSupabaseRecord(client, sourceUrl, updates)`**: Updates an existing record in the `curated_content` table for the given `sourceUrl` with new data (status, messages, AI results, etc.).
*   **`sendNotification(subject, body, isCritical)`**: Sends notifications for critical errors or operational warnings. It attempts to send an email using `nodemailer` if email-related environment variables are configured. If not fully configured, or if email sending fails, it falls back to logging the notification to the console.
*   **`runAgent()`**: The main orchestration function. Initializes the agent, fetches strategies, and manages a queue of URLs to process (including initially targeted sites and discovered links). It handles the lifecycle of each URL: duplicate checking, initial record creation (tagging discovered links), content fetching, link discovery, AI processing, and final record updates. It also includes a startup check for email notification configuration.

## 7. Status Management

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

## 8. Error Handling & Notifications

*   **Retry Logic:** Both `fetchWebContent` (for external content) and `triggerAIProcessing` (for internal API calls) implement retry mechanisms with delays and timeouts, making them resilient to transient network issues and certain server-side errors.
*   **Graceful Exits & Continuations:**
    *   Individual URL processing failures (e.g., fetch error, AI processing error) are logged to Supabase for that specific URL, and the agent continues with the next URL or strategy.
    *   Failure to insert an initial record for a URL (a critical local DB step) will cause the agent to skip that URL and continue.
*   **Notifications:**
    *   The `runAgent` function performs a startup check for essential email environment variables (`EMAIL_HOST`, `EMAIL_USER`, `EMAIL_PASS`, `NOTIFICATION_EMAIL_FROM`, `NOTIFICATION_EMAIL_TO`) and the optional `UPTIME_KUMA_PUSH_URL`. It logs warnings or info messages based on whether these are set.
    *   The `sendNotification` function is now implemented using `nodemailer` to send email notifications if the email environment variables are correctly configured.
    *   If email configuration is incomplete or if an error occurs during email sending, `sendNotification` logs the notification details to the console as a fallback.
    *   Critical notifications are triggered for:
        *   Failure to initialize the Supabase client.
        *   Critical errors during the main strategy processing loop.
        *   Any unhandled top-level exceptions that would terminate the agent.
    *   Warning notifications are sent if no search strategies are found or if a processing queue for an initial site hits `MAX_ITERATIONS_PER_INITIAL_SITE`.
*   **Heartbeat Monitoring (Uptime Kuma):**
    *   Upon successful completion of its entire run (all strategies processed without unhandled critical errors that lead to premature exit), the agent can send a heartbeat ping (HTTP GET request) to a configured Uptime Kuma push URL.
    *   This feature is enabled by setting the `UPTIME_KUMA_PUSH_URL` environment variable. The agent logs at startup whether this URL is configured.
    *   The heartbeat ping is attempted with a timeout (`HEARTBEAT_TIMEOUT_MS`).
    *   Failures during the heartbeat ping itself (e.g., network error, timeout, non-2xx response) are caught, logged, and trigger a non-critical notification via `sendNotification`, but they do not cause the agent's own run to be reported as a failure.
*   **Supabase Errors:** Errors during Supabase operations (insert, update) are caught, logged to the console, and for individual record updates, the agent typically continues processing.

## 9. Supabase Table Interactions

The agent primarily interacts with two Supabase tables:

*   **`search_strategies`**:
    *   **Read:** Fetches records defining what content to look for (keywords, target sites/domains).
    *   Assumed schema includes fields like `keywords` (array of strings or string), `target_sites` (array of strings - URLs), `content_types_to_monitor`.

*   **`curated_content`**:
    *   **Write (Insert & Update):** This is the main table where the agent stores its findings and progress.
    *   An initial record is inserted when a new URL begins processing.
    *   This record is then repeatedly updated with status changes, progress messages, error messages, and eventually, the processed content (title, summary, tags, image URL) from the AI.
    *   Key columns used by the agent: `source_url` (UNIQUE), `title`, `summary`, `tags`, `status`, `agent_progress_message`, `agent_error_message`, `agent_id` (internal processing ID), `created_at`, `updated_at`, `image_url`, `image_status`, `image_ai_hint`, `image_error_message`.
