
# Development Log (Content Curator Bot)

## 🚀 Key Feature Status

- **Strategy Formulation**: When a user inputs a curriculum/topic, the AI suggests relevant search keywords, target websites, and content types to monitor. (Basic implementation complete)
- **Content Discovery & Processing**: When a user adds a URL, the content is summarized, and tags are generated. (Basic implementation complete, uses local storage for discovered items, processing via AI flow, now with a Genkit tool for web fetching and basic progress display)
- **Settings**: API keys (OpenRouter, Google AI), LINE channel information, GitHub information, default curation topic, etc., can be configured. (UI implemented, settings saved to localStorage on client, server action simulates saving)
- **Send to LINE**: There's a button to send processed content to LINE, but the actual API integration is a placeholder.

## 📝 TODO List (English)

### Core Feature Improvements & Backend Implementation

- **[ ] Implement Actual Settings Storage & Management**:
    - **[ ] Server-Side Storage for Sensitive Keys**:
        - Migrate API keys (OpenRouter, Google AI, LINE Channel Access Token/Secret, GitHub PAT) from client-side simulation to secure server-side storage.
        - Utilize environment variables (e.g., via `.env` locally and Firebase App Hosting configuration for deployment) for these keys.
        - Consider Google Secret Manager for more advanced secret management if needed.
    - **[ ] Database for Dynamic User Settings**:
        - For settings like `defaultTopic`, `githubRepoUrl`, `lineUserId` that users can change via the UI, store them in a persistent database (e.g., Firebase Firestore).
        - This is essential if user authentication is ever added, or if settings need to persist beyond a single browser.
    - **[ ] Update `saveSettings` Server Action**:
        - Modify `src/lib/actions.ts#saveSettings` to write to the chosen server-side storage solutions (environment variables where appropriate, database for dynamic settings).
        - Ensure proper validation and error handling during the save process.
        - Remove reliance on `localStorage` for actual persistence of critical settings.

- **[ ] Implement Actual LINE Bot Integration**:
    - **[ ] Implement `sendToLineAction` Logic**:
        - In `src/lib/actions.ts`, replace the placeholder in `sendToLineAction` with actual LINE Messaging API calls.
        - Use `fetch` or a suitable HTTP client library.
        - Retrieve `lineChannelAccessToken` and `lineUserId` securely from server-side settings.
    - **[ ] Design Rich Message Format**:
        - Utilize LINE Flex Messages for a more engaging presentation of curated content (title, summary, source URL button, potentially a preview image).
        - Construct the appropriate JSON payload for the chosen message type.
    - **[ ] Robust Error Handling**:
        - Handle API errors from LINE (e.g., invalid token, user not found, rate limits, message format errors).
        - Provide clear feedback to the UI via the action's return state and toasts.

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
    - **[ ] Add Visual Status Indicator for Agent Health**:
        - Implement a way for the agent to report its operational status (e.g., running, error, stopped).
        - Display this status in the UI (e.g., green/yellow/red light icon in the "Content Monitoring & Processing" section) by querying the agent's status from its storage location or a health endpoint.

- **[ ] Detail & Implement GitHub Integration Feature**:
    - **[ ] Define Content-to-Markdown Conversion**:
        - Specify how curated content (title, summary, tags, source URL) will be formatted into Markdown.
    - **[ ] Secure GitHub PAT Usage**:
        - Retrieve and use the GitHub Personal Access Token from secure server-side settings.
    - **[ ] Implement Git Operations**:
        - Use a library like `octokit/rest.js` or server-side `git` CLI commands to commit and push Markdown files to the user-specified GitHub repository.
    - **[ ] Define File/Repository Structure**:
        - Decide on how files will be organized (e.g., one file per curated item, daily/weekly logs, topic-based folders).
    - **[ ] Create Server Action for Publishing**:
        - Develop a new server action that takes a processed content ID, retrieves its data, formats it, and publishes it to GitHub.
    - **[ ] UI Feedback for Publish Operation**:
        - Show success/failure messages in the UI after attempting to publish.

- **[ ] Content Versioning or History (Optional but useful later)**:
    - Consider a simple system to track when content was processed, sent to LINE, or published to GitHub.

- **[ ] User Authentication System (Optional - if multi-user or personalized server-side settings are needed)**:
    - If the app needs to support multiple users or store personalized settings securely on the server beyond a single `.env` configuration.

### AI and Genkit Flow Enhancements

- **[ ] Enhance AI Prompts & Output Consistency**:
    - Continuously test and refine prompts for `formulateSearchStrategy` and `generateContentSummary` to improve result quality and consistency across various inputs.
    - Consider adding few-shot examples to prompts.
    - Review and adjust Gemini safety settings in Genkit flows if content is being unexpectedly blocked.
- **[x] Implement Genkit Tool for Web Content Fetching**:
    - **[x]** Create a new Genkit `Tool` (e.g., `fetchWebsiteContentTool`).
    - **[x]** This tool should accept a URL, fetch its content, parse the HTML to extract the main article text (stripping boilerplate), and return the clean text (initially returns raw HTML, parsing to be refined).
    - **[x]** Modify the `generateContentSummary` flow to use this tool. The AI model can then be instructed to use this tool to get content for summarization, rather than relying on `{{{articleUrl}}}` directly in the prompt which has limitations.
- **[ ] Image Generation/Processing Feature (Optional Enhancement)**:
    - If content often involves images, or if visual aids are desired for summaries:
        - Explore using Genkit (`googleai/gemini-2.0-flash-exp`) to generate relevant illustrative images based on summaries.
        - Or, use AI to describe key images from source articles if URLs are available.
        - Adhere to `next/image` component and `data-ai-hint` guidelines for any displayed images.

### UI/UX Improvements

- **[x] Detailed Loading State Indication**:
    - For AI flows and other long-running actions (strategy formulation, content processing, publishing), provide more granular progress feedback than a simple spinner (e.g., "Fetching content...", "Summarizing...", "Publishing to GitHub...").
    - Utilize the `progress` field from AI flow outputs. (Basic implementation for content processing done).
- **[ ] Strengthen User Feedback and Notifications**:
    - Continue consistent and informative use of `useToast` for all user actions (success, failure, warnings).
- **[ ] Improve Input Validation Messages**:
    - Make Zod validation error messages more user-friendly in forms.
    - Consider adding client-side validation for quicker feedback, in addition to server-side validation.
- **[ ] Review Responsive Design and Accessibility (A11y)**:
    - Regularly check layouts on various screen sizes.
    - Ensure proper ARIA attributes and semantic HTML for web accessibility.

### Technical Debt & Code Quality

- **[ ] Overall Error Handling Enhancement**:
    - Implement comprehensive error handling across:
        - Client components (React Error Boundaries for sections).
        - Server Actions (return clear error states).
        - AI Flows (graceful failure and error reporting).
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
- **[ ] Environment Variable Management Strategy**:
    - Formalize the process for managing API keys and other environment-specific settings for local development, staging (if any), and production environments. Ensure sensitive data is never committed to version control.
- **[ ] Logging and Monitoring Strategy**:
    - Enhance server-side logging for server actions and AI flow executions (Genkit has logging capabilities).
    - Set up alerts in Cloud Monitoring (if using Google Cloud) for error rates or performance degradation.

## ✅ Completed Major Tasks

- Initial UI setup for dashboard and settings.
- Basic AI integration for strategy formulation and content summarization using Genkit.
- Implemented client-side storage for discovered content and settings (using localStorage as a temporary solution).
- Addressed several Next.js runtime, syntax, and hydration errors.
- Refined UI components and layout.
- Translated development log TODOs to English.
- Initial thoughts on LINE integration and Monitoring Agent status visualization.
- Implemented Genkit Tool (`fetchWebsiteContentTool`) for fetching raw web content and integrated it into the `generateContentSummary` flow.
- Implemented basic detailed loading state indication for content processing.

---

This expanded list should provide a more detailed roadmap. Remember, building all of this takes time and iterative development!
Let me know which areas you'd like to focus on next.
