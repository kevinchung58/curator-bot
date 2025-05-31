
export type SearchStrategy = {
  keywords: string[];
  targetSites: string[];
  contentTypesToMonitor: string[];
};

export type ProcessedContent = {
  id: string;
  title: string;
  summary: string;
  tags: string[];
  sourceUrl: string;
  status: 'new' | 'processing' | 'processed' | 'error' | 'sentToLine';
  progressMessage?: string;
  errorMessage?: string;
};

// AppSettings now only includes non-sensitive, user-configurable preferences.
// Sensitive API keys (Google, LINE, GitHub PAT) should be set as environment variables on the server.
export type AppSettings = {
  lineUserId?: string;
  githubRepoUrl?: string;
  defaultTopic?: string;
};
