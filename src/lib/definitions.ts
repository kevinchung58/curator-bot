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
  errorMessage?: string;
};

export type AppSettings = {
  openRouterApiKey?: string;
  googleApiKey?: string; // Assuming Gemini might be used via Google AI Studio
  lineChannelAccessToken?: string;
  lineChannelSecret?: string;
  lineUserId?: string;
  githubPat?: string;
  githubRepoUrl?: string;
  defaultTopic?: string;
};
