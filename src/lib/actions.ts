
'use server';

import { formulateSearchStrategy, FormulateSearchStrategyInput, FormulateSearchStrategyOutput } from '@/ai/flows/formulate-search-strategy';
import { generateContentSummary, GenerateContentSummaryInput, GenerateContentSummaryOutput } from '@/ai/flows/generate-content-summary';
import type { SearchStrategy, ProcessedContent, AppSettings } from './definitions';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { format } from 'date-fns';

// --- Strategy Formulation ---
const StrategyFormSchema = z.object({
  curriculum: z.string().min(10, { message: 'Curriculum must be at least 10 characters long.' }),
});

export type StrategyFormState = {
  message?: string | null;
  errors?: {
    curriculum?: string[];
  };
  strategy?: SearchStrategy | null;
};

export async function submitStrategyForm(prevState: StrategyFormState | undefined, formData: FormData): Promise<StrategyFormState> {
  const validatedFields = StrategyFormSchema.safeParse({
    curriculum: formData.get('curriculum'),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Validation Error: Please check your input.',
    };
  }

  try {
    const input: FormulateSearchStrategyInput = {
      curriculum: validatedFields.data.curriculum,
    };
    const result: FormulateSearchStrategyOutput = await formulateSearchStrategy(input);
    return {
      message: 'Search strategy formulated successfully.',
      strategy: result,
    };
  } catch (error) {
    console.error('Error formulating search strategy:', error);
    return {
      message: 'Error: Could not formulate search strategy.',
    };
  }
}

// --- Content Processing ---
const ProcessContentSchema = z.object({
  articleUrl: z.string().url({ message: 'Invalid URL format.' }),
  topic: z.string().min(1, { message: 'Topic cannot be empty.' }),
});

export type ProcessContentState = {
  message?: string | null;
  processedContent?: ProcessedContent | null;
  error?: string | null;
  articleId?: string | null;
};

export async function processDiscoveredContent(
  articleId: string,
  articleUrl: string,
  topic: string
): Promise<ProcessContentState> {

  const validatedFields = ProcessContentSchema.safeParse({ articleUrl, topic });

  if (!validatedFields.success) {
    return {
      error: validatedFields.error.flatten().fieldErrors.articleUrl?.[0] || validatedFields.error.flatten().fieldErrors.topic?.[0] || "Validation Error",
      articleId: articleId,
    };
  }

  try {
    const input: GenerateContentSummaryInput = {
      articleUrl: validatedFields.data.articleUrl,
      topic: validatedFields.data.topic,
    };
    const result: GenerateContentSummaryOutput = await generateContentSummary(input);

    let finalStatus: ProcessedContent['status'] = 'processed';
    let errorMessage: string | undefined = undefined;

    if (result.title === "Content Fetch Failed" || result.title === "Content Extraction Failed") {
      finalStatus = 'error';
      errorMessage = result.summary || result.progress;
    }

    const content: ProcessedContent = {
      id: articleId,
      title: result.title,
      summary: result.summary,
      tags: result.tags,
      sourceUrl: result.source_url,
      status: finalStatus,
      progressMessage: result.progress,
      errorMessage: errorMessage,
    };

    return {
      message: finalStatus === 'processed' ? (result.progress || 'Content processed successfully.') : (result.progress || 'Content processing encountered an issue.'),
      processedContent: content,
      articleId: articleId,
    };
  } catch (error: any) {
    console.error('Error processing content (AI flow system error):', error);
    const systemErrorMessage = error.message || 'An unknown AI system error occurred during content processing.';
    return {
      error: `Error: Content processing failed due to an AI system issue.`, // Main toast message
      articleId: articleId,
      processedContent: {
        id: articleId,
        sourceUrl: articleUrl,
        title: 'AI System Error',
        summary: 'The AI model encountered an unexpected system error or did not return a valid response. Please try again later or check server logs if the issue persists.',
        tags: ['error', 'ai-system-error', 'processing-failure'],
        status: 'error',
        progressMessage: `AI system error: ${systemErrorMessage}`,
        errorMessage: `AI system error: ${systemErrorMessage}`,
      }
    };
  }
}


// --- Settings ---
const SettingsFormSchema = z.object({
  defaultTopic: z.string().optional(),
  lineUserId: z.string().optional(),
  githubRepoUrl: z.string().url().optional().or(z.literal('')),
});

export type SettingsFormState = {
  message?: string | null;
  errors?: {
    [key in keyof AppSettings]?: string[];
  };
  settings?: AppSettings | null;
};

export async function saveSettings(prevState: SettingsFormState | undefined, formData: FormData): Promise<SettingsFormState> {
  const data = Object.fromEntries(formData.entries());
  const validatedFields = SettingsFormSchema.safeParse(data);

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors as any,
      message: 'Validation Error: Please check your input.',
    };
  }
  console.log("User preferences received (to be saved by client):", validatedFields.data);

  return {
    message: 'User preferences updated. They will be saved in your browser.',
    settings: validatedFields.data as AppSettings,
  };
}

// --- LINE Bot action ---
export async function sendToLineAction(
  content: ProcessedContent,
  lineUserId: string | undefined | null
): Promise<{ success: boolean; message: string }> {
  if (!lineUserId) {
    return { success: false, message: 'LINE User ID not provided. Please configure it in Settings.' };
  }

  const lineChannelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!lineChannelAccessToken) {
    return { success: false, message: 'LINE Channel Access Token not configured on the server.' };
  }

  const flexMessage = {
    type: 'flex',
    altText: content.title || 'New Content Proposal',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: 'New Content Proposal',
            weight: 'bold',
            size: 'md',
            color: '#FFFFFF',
          },
        ],
        backgroundColor: '#00B900',
        paddingAll: 'md',
      },
      hero: content.title ? { // Only add hero if there's a title that isn't a failure message
        type: 'box',
        layout: 'vertical',
        contents: [
           {
            type: 'text',
            text: content.title,
            weight: 'bold',
            size: 'xl',
            wrap: true,
            margin: 'md'
          }
        ],
        paddingAll: 'md'
      } : undefined,
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: content.summary ? (content.summary.length > 100 ? content.summary.substring(0, 97) + '...' : content.summary) : 'No summary available.',
            wrap: true,
            size: 'sm',
            margin: 'md',
          },
        ],
        paddingAll: 'md',
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            style: 'link',
            height: 'sm',
            action: {
              type: 'uri',
              label: 'View Source',
              uri: content.sourceUrl,
            },
          },
        ],
        flex: 0,
        paddingAll: 'md',
      },
    },
  };

  try {
    const response = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${lineChannelAccessToken}`,
      },
      body: JSON.stringify({
        to: lineUserId,
        messages: [flexMessage],
      }),
    });

    if (!response.ok) {
      let errorMessage = `LINE API Error (${response.status}): `;
      try {
        const errorBody = await response.json();
        errorMessage += errorBody.message || 'Unknown error';
        if (errorBody.details && Array.isArray(errorBody.details)) {
          const details = errorBody.details.map((detail: any) => `${detail.property}: ${detail.message}`).join(', ');
          if (details) {
            errorMessage += ` (Details: ${details})`;
          }
        }
        console.error('LINE API Error:', response.status, JSON.stringify(errorBody, null, 2));
      } catch (parseError) {
        errorMessage += 'Failed to parse error response from LINE API.';
        console.error('LINE API Error: Failed to parse error response. Status:', response.status);
      }
      return { success: false, message: errorMessage };
    }

    return { success: true, message: `Content "${content.title || 'proposal'}" sent to LINE successfully.` };
  } catch (error: any) {
    console.error('Error sending to LINE:', error);
    return { success: false, message: `Failed to send to LINE: ${error.message}` };
  }
}

// --- GitHub Publishing Action ---
function generateMarkdownContent(content: ProcessedContent): string {
  const today = format(new Date(), 'yyyy-MM-dd');
  const frontmatter = `---
title: "${content.title.replace(/"/g, '\\"')}"
source_url: "${content.sourceUrl}"
tags:
${content.tags.map(tag => `  - ${tag}`).join('\n')}
date_processed: "${today}"
curated_by: "Content Curator Bot"
---`;

  const body = `
# ${content.title}

[Source Article](${content.sourceUrl})

## Summary

${content.summary}

---
*Curated by Content Curator Bot on ${today}*
`;

  return `${frontmatter}\n${body}`;
}

export async function publishToGithubAction(
  content: ProcessedContent,
  githubRepoUrl: string | undefined | null
): Promise<{ success: boolean; message: string }> {
  console.log('Attempting to publish to GitHub:', content.title, githubRepoUrl);
  if (!githubRepoUrl) {
    return { success: false, message: 'GitHub Repository URL not configured in Settings.' };
  }
  const githubPat = process.env.GITHUB_PAT;
  if (!githubPat) {
    return { success: false, message: 'GitHub Personal Access Token (GITHUB_PAT) not configured on the server.' };
  }
  
  const markdownContent = generateMarkdownContent(content);
  console.log('Generated Markdown for GitHub:');
  console.log(markdownContent);

  // Placeholder for actual GitHub API interaction
  // TODO: Implement actual git operations (clone, add, commit, push) or API calls (Octokit)
  // For now, simulate success
  // This timeout simulates async work, like an API call.
  await new Promise(resolve => setTimeout(resolve, 1000)); 
 
  return { success: true, message: `Content "${content.title}" formatted to Markdown and (simulated) published to ${githubRepoUrl}.` };
}

    