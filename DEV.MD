
# Development Log (Content Curator Bot)

## 🚀 Key Feature Status

- **Strategy Formulation**: When a user inputs a curriculum/topic, the AI suggests relevant search keywords, target websites, and content types to monitor. (Basic implementation complete, prompt refined for schema adherence and few-shot examples added. Client-side validation added via `react-hook-form`.)
- **Content Discovery & Processing**: When a user adds a URL, the content is summarized, and tags are generated. (Basic implementation complete, uses local storage for discovered items, processing via AI flow, now with a Genkit tool for web fetching, basic progress display, and refined AI prompt for summarization with safety settings and few-shot examples.)
- **[x] Image Generation**: For processed content, users can trigger AI-powered image generation to create illustrative visuals. (Genkit flow, server action, and UI integration complete. Displays image, loading, and error states.)
- **Settings**: Non-sensitive user preferences (default topic, LINE User ID, GitHub Repo URL) can be configured and are saved to `localStorage` via a custom hook `useAppSettings`. Sensitive API keys (Google AI, LINE, GitHub PAT) are managed via server-side environment variables. (UI updated, `saveSettings` action refined, `useAppSettings` hook implemented and integrated. Client-side validation added.)
- **Send to LINE**: Button exists. Core logic to make API call to LINE with a Flex Message implemented in server action. Client-side logic to retrieve and pass `lineUserId` also implemented. Actual sending depends on valid server-side `LINE_CHANNEL_ACCESS_TOKEN` and client-side `lineUserId` configuration. Server-side error parsing from LINE API enhanced.
- **Publish to GitHub**: Button exists for processed content. Calls a server action that now generates Markdown for the content and creates/updates files in the specified GitHub repository using Octokit. Client-side logic retrieves `githubRepoUrl` and handles success/failure toasts. `GITHUB_PAT` environment variable is required.

## 📝 TODO List (English)

### Core Feature Improvements & Backend Implementation

- **[x] Implement Actual Settings Storage & Management**:
    - **[x] Server-Side Storage for Sensitive Keys**:
        - **[x] Clarification**: Sensitive API keys (Google AI, LINE Channel Access Token, GitHub PAT) are to be managed via server-side environment variables.
        - **[ ]** (Future) Consider Google Secret Manager.
    - **[x] Client-Side Storage for Non-Sensitive Preferences (localStorage via Hook)**:
        - **[x]** `useAppSettings` hook manages `defaultTopic`, `githubRepoUrl`, `lineUserId`.
        - **[ ]** (Future) If user auth added, migrate to persistent DB.
    - **[x] Update `saveSettings` Server Action**:
        - **[x]** Action handles non-sensitive preferences, returns to client; hook saves to `localStorage`.
        - **[ ]** (Future) If DB used, modify action to write to DB.

- **[x] Implement Actual LINE Bot Integration**:
    - **[x] Implement `sendToLineAction` Logic**:
        - **[x]** Uses `fetch` for LINE Messaging API, retrieves `LINE_CHANNEL_ACCESS_TOKEN` (server env) and `lineUserId` (client).
    - **[x] Design Rich Message Format**:
        - **[x]** Basic LINE Flex Message constructed.
    - **[x] Robust Error Handling**:
        - **[x]** Basic client/server error handling implemented.
        - **[x]** Enhanced server-side error parsing from LINE API.

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
    - **[~] Add Visual Status Indicator for Agent Health**:
        - **[x] UI placeholder added to display simulated agent status in `DiscoveredContentSection`.**
        - **[ ]** Implement a way for the agent to report its operational status (e.g., running, error, stopped).
        - **[ ]** Display this status in the UI by querying the agent's status from its storage location or a health endpoint. 

- **[x] Detail & Implement GitHub Integration Feature**:
    - **[x] Define Content-to-Markdown Conversion**:
        - **[x] Specified how curated content (title, summary, tags, source URL) will be formatted into Markdown (including frontmatter) in `publishToGithubAction`.**
    - **[x] Secure GitHub PAT Usage**:
        - **[x]** Retrieve and use the GitHub Personal Access Token from a secure server-side environment variable (`GITHUB_PAT`).
    - **[x] Implement Git Operations**:
        - **[x] `publishToGithubAction` now uses `@octokit/rest` to create/update files (handling both new and existing files) in the specified GitHub repository.**
        - **[x] Error handling for GitHub API calls implemented and refined.**
        - **[x]** NOTE: Assumes a base directory like `curated-content/` exists in the repo or user creates it.
    - **[x] Define File/Repository Structure**:
        - **[x]** Decision: Files will be organized under a `curated-content/` directory.
        - **[x]** Filename: `YYYY-MM-DD-slugified-title-shortId.md`.
    - **[x] Create Server Action for Publishing**:
        - **[x]** A server action (`publishToGithubAction`) has been created and significantly enhanced with actual Git operations via Octokit.
    - **[x] UI Feedback for Publish Operation**:
        - **[x]** "Publish to GitHub" button added to `ContentCard` for processed items.
        - **[x]** Toasts for success/failure of the publish operation implemented in `DiscoveredContentSection`.
        - **[x]** New status 'publishedToGithub' added to `ProcessedContent` and UI reflects this.

- **[ ] Content Versioning or History (Optional but useful later)**:
    - Consider a simple system to track when content was processed, sent to LINE, or published to GitHub.

- **[ ] User Authentication System (Optional - if multi-user or personalized server-side settings are needed)**:
    - If the app needs to support multiple users or store personalized settings securely on the server beyond a single `.env` configuration.

### AI and Genkit Flow Enhancements

- **[x] Enhance AI Prompts & Output Consistency (for `generateContentSummary` flow)**:
    - **[x]** Continuously test and refine prompts for `generateContentSummary` to improve result quality and consistency. (Refined, includes progress messaging)
    - **[x]** Consider adding few-shot examples to prompts for `generateContentSummary`. (Added examples for success and extraction failure)
    - **[x]** Review and adjust Gemini safety settings in `generateContentSummary` Genkit flow. (Initial settings added)
- **[x] Refine prompt for `formulateSearchStrategy`**:
    - **[x]** Ensured example JSON in prompt matches Zod schema field names.
    - **[x]** Added few-shot examples for `formulateSearchStrategy`.
- **[x] Implement Genkit Tool for Web Content Fetching**:
    - **[x]** Create a new Genkit `Tool` (`fetchWebsiteContentTool`).
    - **[x]** This tool accepts a URL, fetches its raw HTML content.
    - **[x]** Modify the `generateContentSummary` flow to use this tool.
- **[x] Image Generation/Processing Feature**:
    - **[x]** Created Genkit flow (`generateIllustrativeImageFlow`) using `googleai/gemini-2.0-flash-exp` to generate images based on summaries and titles.
    - **[x]** Implemented server action (`generateImageForContentAction`) to call the flow.
    - **[x]** Added UI elements in `ContentCard` to trigger image generation, display the image (using `next/image`), or show loading/error states.
    - **[x]** Ensured `next/image` component is used with `data-ai-hint` for generated images.

### UI/UX Improvements

- **[x] Detailed Loading State Indication**:
    - **[x]** For AI flows and other long-running actions (content processing), provide more granular progress feedback. (Basic implementation for content processing done, leveraging AI flow's progress field and refined server action logic).
    - **[x]** Extend to strategy formulation (reviewed and deemed sufficient with current spinner).
    - **[x]** Extend to publishing actions and other card actions (Process, Send to LINE, Publish to GitHub, Generate Image buttons in `ContentCard` now have specific loading spinners).
- **[x] Strengthen User Feedback and Notifications**:
    - **[x]** Continue consistent and informative use of `useToast` for all user actions.
- **[x] Improve Input Validation Messages**:
    - **[x]** Make Zod validation error messages more user-friendly in forms (Strategy Section done via `FormMessage`).
    - **[x]** Add client-side validation for quicker feedback, in addition to server-side validation (Strategy Section done).
    - **[x]** Apply client-side validation to Settings page.
- **[ ] Review Responsive Design and Accessibility (A11y)**:
    - Regularly check layouts on various screen sizes.
    - Ensure proper ARIA attributes and semantic HTML for web accessibility.
- **[x] CSS Cleanup**: 
    - **[x]** Removed redundant global font-family CSS rule.
    - **[x]** Consolidated `@layer base` directives in `globals.css`.

### Technical Debt & Code Quality

- **[~] Overall Error Handling Enhancement**:
    - Implement comprehensive error handling across:
        - **[~] Client components (React Error Boundaries for sections).** (Started: ErrorBoundary created and applied to DiscoveredContentSection and StrategySection on dashboard page)
        - **[x]** Server Actions (return clear error states, especially for catastrophic AI flow failures - improved for `generateContentSummary`, `sendToLineAction`, `generateImageForContentAction` with further refinement for AI system errors in `processDiscoveredContent`).
        - **[x]** AI Flows (graceful failure and error reporting - improved for `generateContentSummary`, `generateIllustrativeImageFlow`).
        - Future Monitoring Agent (robust logging and error recovery).
- **[ ] Write Test Code**:
    - **Unit Tests**: For utility functions, key component logic, Zod schemas (e.g., using Jest/Vitest, React Testing Library).
    - **Integration Tests**: For server actions interacting with AI flows and database operations.
    - **E2E Tests (Future)**: Define and automate end-to-end test scenarios for key user workflows (e.g., using Playwright or Cypress).
- **[x] Code Refactoring**:
    - **[x]** Created `useAppSettings` hook to centralize `localStorage` management for application settings.
    - Conduct ongoing code refactoring: remove duplicate code, ensure components are well-defined and reusable, improve readability and maintainability.
- **[ ] Dependency Management**:
    - Regularly check and update library versions in `package.json`, addressing any breaking changes.

### Deployment & Operations

- **[x] Detail `apphosting.yaml` Configuration**:
    - **[x] Added common resource settings (CPU, memory, minInstances) and comments.**
    - Review and optimize resource settings for production, especially considering the auto-monitoring agent.
- **[x] Environment Variable Management Strategy**:
    - **[x] Clarification**: Sensitive API keys managed via environment variables. Non-sensitive user preferences use `localStorage` (managed by `useAppSettings` hook).
- **[x] Logging and Monitoring Strategy**:
    - **[x] Enhanced basic server-side console logging in key actions and AI flows.**
    - Enhance server-side logging for server actions and AI flow executions.
    - Set up alerts in Cloud Monitoring for error rates or performance degradation.

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
- **Refactored Settings page to manage only non-sensitive user preferences in `localStorage`; sensitive API keys are now expected as server-side environment variables. Created `useAppSettings` hook to manage this client-side storage.**
- **Implemented core logic for `sendToLineAction` to make API calls to LINE with a basic Flex Message. Client-side updated to pass `lineUserId`. Server-side error parsing from LINE API enhanced.**
- **Refined `formulateSearchStrategy` prompt to ensure output JSON field names match the Zod schema and added few-shot examples. Integrated `react-hook-form` for client-side validation in Strategy Section.**
- **Enhanced error handling in `processDiscoveredContent` for catastrophic AI flow failures.**
- **Implemented placeholder functionality for "Publish to GitHub" including UI button, server action (which now generates Markdown), and status updates.**
- **Cleaned up a redundant global font-family CSS rule.**
- **Defined content-to-Markdown conversion logic within `publishToGithubAction`.**
- **Implemented actual file creation/update in GitHub using Octokit within `publishToGithubAction`.**
- **Added UI placeholder for simulated agent status in `DiscoveredContentSection`.**
- **Enhanced `publishToGithubAction` to correctly handle updating existing files.**
- **Improved loading state indication for action buttons in `ContentCard` with per-button spinners.**
- **Updated `apphosting.yaml` with common resource settings and comments.**
- **Enhanced basic server-side console logging in key actions and AI flows.**
- **Implemented Image Generation feature: Genkit flow, server action, UI in `ContentCard` for generating and displaying images, including loading/error states.**
- **Applied client-side validation using `react-hook-form` to the Settings page.**
- **Introduced a React ErrorBoundary component and applied it to `DiscoveredContentSection` and `StrategySection` on the dashboard page.**
- **Consolidated `@layer base` directives in `globals.css`.**

---

This expanded list should provide a more detailed roadmap. Remember, building all of this takes time and iterative development!
Let me know which areas you'd like to focus on next.

