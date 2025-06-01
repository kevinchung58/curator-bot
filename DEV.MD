
# Development Log (Content Curator Bot)

## 🚀 Key Feature Status

- **Strategy Formulation**: When a user inputs a curriculum/topic, the AI suggests relevant search keywords, target websites, and content types to monitor. (Basic implementation complete, prompt refined for schema adherence)
- **Content Discovery & Processing**: When a user adds a URL, the content is summarized, and tags are generated. (Basic implementation complete, uses local storage for discovered items, processing via AI flow, now with a Genkit tool for web fetching, basic progress display, and refined AI prompt for summarization with safety settings and few-shot examples.)
- **Settings**: Non-sensitive user preferences (default topic, LINE User ID, GitHub Repo URL) can be configured and are saved to `localStorage`. Sensitive API keys (Google AI, LINE, GitHub PAT) are managed via server-side environment variables. (UI updated, `saveSettings` action refined)
- **Send to LINE**: Button exists. Core logic to make API call to LINE with a Flex Message implemented in server action. Client-side logic to retrieve and pass `lineUserId` also implemented. Actual sending depends on valid server-side `LINE_CHANNEL_ACCESS_TOKEN` and client-side `lineUserId` configuration. Server-side error parsing from LINE API enhanced.
- **Publish to GitHub**: Button exists for processed content. Calls a server action that now generates Markdown for the content and **creates/updates files in the specified GitHub repository using Octokit**. Client-side logic retrieves `githubRepoUrl` and handles success/failure toasts. Actual Git operations or API calls need implementation. `GITHUB_PAT` environment variable is required.

## 📝 TODO List (English)

### Core Feature Improvements & Backend Implementation

- **[x] Implement Actual Settings Storage & Management**:
    - **[x] Server-Side Storage for Sensitive Keys**:
        - **Clarification**: Sensitive API keys (Google AI, LINE Channel Access Token, GitHub PAT) are to be managed via server-side environment variables (e.g., `.env` locally, Firebase App Hosting configuration for deployment). They are **not** to be set via the UI or stored in `localStorage`. The settings page UI has been updated to reflect this.
        - **[ ]** (Future) Consider Google Secret Manager for more advanced secret management if needed.
    - **[ ] Database for Dynamic User Settings (Non-Sensitive)**:
        - For non-sensitive settings like `defaultTopic`, `githubRepoUrl`, `lineUserId` that users can change via the UI: currently, these are saved to `localStorage`.
        - **Future Enhancement**: If user authentication is added, or if these settings need to persist across browsers/devices for a user, migrate them to a persistent database (e.g., Firebase Firestore).
    - **[x] Update `saveSettings` Server Action**:
        - **Update**: The `saveSettings` action in `src/lib/actions.ts` now only handles non-sensitive preferences (`defaultTopic`, `lineUserId`, `githubRepoUrl`). It returns these to the client, which then saves them to `localStorage`.
        - **[ ]** (Future) If/when a database is used for these preferences, modify the action to write to the database.

- **[x] Implement Actual LINE Bot Integration**:
    - **[x] Implement `sendToLineAction` Logic**:
        - In `src/lib/actions.ts`, the placeholder in `sendToLineAction` has been replaced with actual LINE Messaging API calls using `fetch`.
        - Retrieves `lineChannelAccessToken` (from server environment variable `process.env.LINE_CHANNEL_ACCESS_TOKEN`) and `lineUserId` (passed from client).
    - **[x] Design Rich Message Format**:
        - A basic LINE Flex Message is constructed to present curated content (title, summary, source URL button).
    - **[x] Robust Error Handling**:
        - Basic error handling for API calls from LINE implemented in the action.
        - Client-side checks for `lineUserId` and feedback via toasts implemented.
        - **[x]** Further enhance server-side error handling (e.g., more specific error parsing from LINE API).

- **[ ] Develop Content Auto-Monitoring Agent (Backend Process)**:
    - **[ ] Choose Agent Architecture**:
        - Option 1: Serverless function (e.g., Cloud Function for Firebase) triggered by a scheduler (e.g., Cloud Scheduler).
        - Option 2: A continuously running process or scheduled job within the App Hosting backend (depending on service capabilities).
    - **[ ] Implement Web Content Fetching & Parsing**:
        - Fetch content from target websites identified in the search strategy.
        - Use libraries like `node-fetch` (or `axios`) and HTML parsers (`jsdom` with `Readability.js` or `cheerio`) to extract clean article text.
        - Ensure compliance with `robots.txt`.
        - Handle potential errors during fetching/parsing gracefully.
    - **[ ] Integrate with Search Strategy**:
        - The agent must access the user-defined (or AI-generated) search keywords and target websites from their storage location (database/config).
    - **[ ] Prevent Duplicate Processing**:
        - Implement a mechanism (e.g., storing processed URLs in a database) to avoid re-processing the same content.
    - **[ ] Trigger AI Summarization**:
        - Once new content is discovered and fetched, the agent should invoke the `generateContentSummary` Genkit flow.
    - **[ ] Persistent Storage for Discovered Content**:
        - Save newly discovered and processed content items to a database (e.g., Firestore) so they can be displayed in the UI's "Discovered Content Section". This replaces the current `localStorage` approach for items found by the agent.
    - **[~] Add Visual Status Indicator for Agent Health**: (Agent backend not yet implemented)
        - **[x] UI placeholder added to display simulated agent status in `DiscoveredContentSection`.**
        - **[ ]** Implement a way for the agent to report its operational status (e.g., running, error, stopped).
        - **[ ]** Display this status in the UI by querying the agent's status from its storage location or a health endpoint. 

- **[x] Detail & Implement GitHub Integration Feature**:
    - **[x] Define Content-to-Markdown Conversion**:
        - **Specified how curated content (title, summary, tags, source URL) will be formatted into Markdown (including frontmatter) in `publishToGithubAction`.**
    - **[x] Secure GitHub PAT Usage**:
        - Retrieve and use the GitHub Personal Access Token from a secure server-side environment variable (`GITHUB_PAT`). (Action now uses this for Octokit).
    - **[x] Implement Git Operations**:
        - **`publishToGithubAction` now uses `@octokit/rest` to create/update files in the specified GitHub repository.**
        - **Basic error handling for GitHub API calls implemented.**
        - **NOTE**: Assumes a base directory like `curated-content/` exists in the repo or user creates it. More robust directory creation/checking could be future enhancement.
    - **[~] Define File/Repository Structure**:
        - **Decision**: Files will be organized under a `curated-content/` directory.
        - **Filename**: `YYYY-MM-DD-slugified-title-shortId.md` (e.g., `curated-content/2023-11-21-my-awesome-article-a1b2c3d4.md`).
    - **[x] Create Server Action for Publishing**:
        - **A server action (`publishToGithubAction`) has been created and significantly enhanced with actual Git operations via Octokit.**
    - **[x] UI Feedback for Publish Operation**:
        - **"Publish to GitHub" button added to `ContentCard` for processed items.**
        - **Toasts for success/failure of the publish operation implemented in `DiscoveredContentSection`.**
        - **New status 'publishedToGithub' added to `ProcessedContent` and UI reflects this.**

- **[ ] Content Versioning or History (Optional but useful later)**:
    - Consider a simple system to track when content was processed, sent to LINE, or published to GitHub.

- **[ ] User Authentication System (Optional - if multi-user or personalized server-side settings are needed)**:
    - If the app needs to support multiple users or store personalized settings securely on the server beyond a single `.env` configuration.

### AI and Genkit Flow Enhancements

- **[x] Enhance AI Prompts & Output Consistency (for `generateContentSummary` flow)**:
    - **[x]** Continuously test and refine prompts for `generateContentSummary` to improve result quality and consistency across various inputs. (Initial refinement done, including progress messaging from LLM)
    - **[x]** Consider adding few-shot examples to prompts for `generateContentSummary`. (Added examples for success and extraction failure)
    - **[x]** Review and adjust Gemini safety settings in `generateContentSummary` Genkit flow. (Initial settings added)
- **[x] Refine prompt for `formulateSearchStrategy`**:
    - **[x]** Ensured example JSON in prompt matches Zod schema field names.
    - **[ ]** (Future) Consider adding few-shot examples for `formulateSearchStrategy`.
- **[x] Implement Genkit Tool for Web Content Fetching**:
    - **[x]** Create a new Genkit `Tool` (`fetchWebsiteContentTool`).
    - **[x]** This tool accepts a URL, fetches its raw HTML content. (LLM is then prompted to parse/extract from this raw HTML).
    - **[x]** Modify the `generateContentSummary` flow to use this tool.
- **[ ] Image Generation/Processing Feature (Optional Enhancement)**:
    - If content often involves images, or if visual aids are desired for summaries:
        - Explore using Genkit (`googleai/gemini-2.0-flash-exp`) to generate relevant illustrative images based on summaries.
        - Or, use AI to describe key images from source articles if URLs are available.
        - Adhere to `next/image` component and `data-ai-hint` guidelines for any displayed images.

### UI/UX Improvements

- **[x] Detailed Loading State Indication**:
    - **[x]** For AI flows and other long-running actions (content processing), provide more granular progress feedback. (Basic implementation for content processing done, leveraging AI flow's progress field and refined server action logic).
    - **[ ]** Extend to strategy formulation and future publishing actions.
- **[x] Strengthen User Feedback and Notifications**:
    - Continue consistent and informative use of `useToast` for all user actions (success, failure, warnings). (Improved for LINE sending and GitHub publishing simulation)
- **[ ] Improve Input Validation Messages**:
    - Make Zod validation error messages more user-friendly in forms.
    - Consider adding client-side validation for quicker feedback, in addition to server-side validation.
- **[ ] Review Responsive Design and Accessibility (A11y)**:
    - Regularly check layouts on various screen sizes.
    - Ensure proper ARIA attributes and semantic HTML for web accessibility.
- **[x] CSS Cleanup**: Removed redundant global font-family CSS rule.

### Technical Debt & Code Quality

- **[x] Overall Error Handling Enhancement**:
    - Implement comprehensive error handling across:
        - Client components (React Error Boundaries for sections).
        - **[x]** Server Actions (return clear error states, especially for catastrophic AI flow failures - improved for `generateContentSummary` and `sendToLineAction`, with further refinement for AI system errors in `processDiscoveredContent`).
        - **[x]** AI Flows (graceful failure and error reporting - improved for `generateContentSummary`).
        - Future Monitoring Agent (robust logging and error recovery).
- **[ ] Write Test Code**:
    - **Unit Tests**: For utility functions, key component logic, Zod schemas (e.g., using Jest/Vitest, React Testing Library).
    - **Integration Tests**: For server actions interacting with AI flows and database operations.
    - **E2E Tests (Future)**: Define and automate end-to-end test scenarios for key user workflows (e.g., using Playwright or Cypress).
- **[ ] Code Refactoring**:
    - Conduct ongoing code refactoring: remove duplicate code, ensure components are well-defined and reusable, improve readability and maintainability.
- **[ ] Dependency Management**:
    - Regularly check and update library versions in `package.json`, addressing any breaking changes.

### Deployment & Operations

- **[ ] Detail `apphosting.yaml` Configuration**:
    - Review and optimize resource settings (CPU, memory, min/max instances) for the production environment, especially considering the potential load from the auto-monitoring agent.
- **[x] Environment Variable Management Strategy**:
    - **Clarification**: Sensitive API keys (Google AI, LINE_CHANNEL_ACCESS_TOKEN, GITHUB_PAT etc.) must be managed via environment variables (e.g., `.env` locally, platform-specific settings for App Hosting). The Settings UI now directs users accordingly. Non-sensitive user preferences use `localStorage`.
- **[ ] Logging and Monitoring Strategy**:
    - Enhance server-side logging for server actions and AI flow executions (Genkit has logging capabilities).
    - Set up alerts in Cloud Monitoring (if using Google Cloud) for error rates or performance degradation.

## ✅ Completed Major Tasks

- Initial UI setup for dashboard and settings.
- Basic AI integration for strategy formulation and content summarization using Genkit.
- Implemented client-side storage for discovered content and (non-sensitive) settings using `localStorage`.
- Addressed several Next.js runtime, syntax, and hydration errors.
- Refined UI components and layout.
- Translated development log TODOs to English.
- Initial thoughts on LINE integration and Monitoring Agent status visualization.
- **Implemented Genkit Tool (`fetchWebsiteContentTool`) for fetching raw web content and integrated it into the `generateContentSummary` flow.**
- **Implemented basic detailed loading state indication for content processing by leveraging AI flow's progress output.**
- **Refined `generateContentSummary` prompt for better handling of HTML extraction and progress reporting, added initial Gemini safety settings, and added few-shot examples.**
- **Refactored Settings page to manage only non-sensitive user preferences in `localStorage`; sensitive API keys are now expected as server-side environment variables.**
- **Implemented core logic for `sendToLineAction` to make API calls to LINE with a basic Flex Message. Client-side updated to pass `lineUserId`. Server-side error parsing from LINE API enhanced.**
- **Refined `formulateSearchStrategy` prompt to ensure output JSON field names match the Zod schema.**
- **Enhanced error handling in `processDiscoveredContent` for catastrophic AI flow failures.**
- **Added placeholder functionality for "Publish to GitHub" including UI button, server action (which now generates Markdown), and status updates.**
- **Cleaned up a redundant global font-family CSS rule.**
- **Defined content-to-Markdown conversion logic within `publishToGithubAction`.**
- **Implemented actual file creation/update in GitHub using Octokit within `publishToGithubAction`.**

---

This expanded list should provide a more detailed roadmap. Remember, building all of this takes time and iterative development!
Let me know which areas you'd like to focus on next.

    
