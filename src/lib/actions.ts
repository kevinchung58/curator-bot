
'use server';

import { formulateSearchStrategy, FormulateSearchStrategyInput, FormulateSearchStrategyOutput } from '@/ai/flows/formulate-search-strategy';
import { generateContentSummary, GenerateContentSummaryInput, GenerateContentSummaryOutput } from '@/ai/flows/generate-content-summary';
import { generateIllustrativeImage, GenerateIllustrativeImageInput, GenerateIllustrativeImageOutput } from '@/ai/flows/generate-illustrative-image';
import type { SearchStrategy, ProcessedContent, AppSettings } from './definitions';
import { StrategyFormSchema, SettingsFormSchema } from './definitions'; // Import from definitions
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { format } from 'date-fns';
import { Octokit } from "@octokit/rest";

// --- Strategy Formulation ---
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
  console.log('[Action] submitStrategyForm: Formulating search strategy for curriculum excerpt:', validatedFields.data.curriculum.substring(0,100) + "...");

  try {
    const input: FormulateSearchStrategyInput = {
      curriculum: validatedFields.data.curriculum,
    };
    const result: FormulateSearchStrategyOutput = await formulateSearchStrategy(input);
    console.log('[Action] submitStrategyForm: Strategy formulated successfully.');
    return {
      message: 'Search strategy formulated successfully.',
      strategy: result,
    };
  } catch (error) {
    console.error('[Action] submitStrategyForm: Error formulating search strategy:', error);
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
  console.log('[Action] processDiscoveredContent: Processing content for URL:', validatedFields.data.articleUrl, 'Topic:', validatedFields.data.topic);

  try {
    const input: GenerateContentSummaryInput = {
      articleUrl: validatedFields.data.articleUrl,
      topic: validatedFields.data.topic,
    };
    const result: GenerateContentSummaryOutput = await generateContentSummary(input);
    console.log('[Action] processDiscoveredContent: Summary generation result - Title:', result.title.substring(0,50) + "...", 'Progress:', result.progress);


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
      imageStatus: 'none', // Initialize image status
    };

    return {
      message: finalStatus === 'processed' ? (result.progress || 'Content processed successfully.') : (result.progress || 'Content processing encountered an issue.'),
      processedContent: content,
      articleId: articleId,
    };
  } catch (error: any) {
    console.error('[Action] processDiscoveredContent: Error processing content (AI flow system error):', error);
    const systemErrorMessage = error.message || 'An unknown AI system error occurred during content processing.';
    return {
      error: `Error: Content processing failed due to an AI system issue.`, 
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
        imageStatus: 'none',
      }
    };
  }
}


// --- Settings ---
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
  console.log("[Action] saveSettings: User preferences received (to be saved by client):", validatedFields.data);

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
  console.log('[Action] sendToLineAction: Attempting to send content to LINE User ID:', lineUserId, 'Title:', content.title.substring(0,50)+"...");
  if (!lineUserId) {
    console.warn('[Action] sendToLineAction: LINE User ID not provided.');
    return { success: false, message: 'LINE User ID not provided. Please configure it in Settings.' };
  }

  const lineChannelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!lineChannelAccessToken) {
    console.error('[Action] sendToLineAction: LINE_CHANNEL_ACCESS_TOKEN not configured on the server.');
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
      hero: content.title ? { 
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
      let errorMessageText = `LINE API Error (${response.status}): `;
      try {
        const errorBody = await response.json();
        errorMessageText += errorBody.message || 'Unknown error';
        if (errorBody.details && Array.isArray(errorBody.details)) {
          const details = errorBody.details.map((detail: any) => `${detail.property}: ${detail.message}`).join(', ');
          if (details) {
            errorMessageText += ` (Details: ${details})`;
          }
        }
        console.error('[Action] sendToLineAction: LINE API Error:', response.status, JSON.stringify(errorBody, null, 2));
      } catch (parseError) {
        errorMessageText += 'Failed to parse error response from LINE API.';
        console.error('[Action] sendToLineAction: LINE API Error: Failed to parse error response. Status:', response.status);
      }
      return { success: false, message: errorMessageText };
    }
    console.log(`[Action] sendToLineAction: Content "${content.title || 'proposal'}" sent to LINE successfully.`);
    return { success: true, message: `Content "${content.title || 'proposal'}" sent to LINE successfully.` };
  } catch (error: any) {
    console.error('[Action] sendToLineAction: Error sending to LINE:', error);
    return { success: false, message: `Failed to send to LINE: ${error.message}` };
  }
}

// --- GitHub Publishing Action ---

function slugify(text: string): string {
  if (!text) return 'untitled';
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-') 
    .replace(/[^\w-]+/g, '') 
    .replace(/--+/g, '-') 
    .substring(0, 75); 
}

function generateMarkdownContent(content: ProcessedContent): string {
  const today = format(new Date(), 'yyyy-MM-dd');
  const frontmatterTitle = typeof content.title === 'string' ? content.title.replace(/"/g, '\\"') : 'Untitled Content';
  
  const frontmatter = `---
title: "${frontmatterTitle}"
source_url: "${content.sourceUrl}"
tags:
${content.tags.map(tag => `  - ${tag}`).join('\n')}
date_processed: "${today}"
curated_by: "Content Curator Bot"
content_id: "${content.id}"
${content.imageUrl ? `image_generated_data_uri: "See content for data URI (too long for frontmatter)"\nimage_ai_hint: "${content.imageAiHint || ''}"`: ''}
---`;

  const body = `
# ${frontmatterTitle}

[Source Article](${content.sourceUrl})

## Summary

${content.summary || 'No summary available.'}

${content.imageUrl ? `\n## Generated Image\n\n(Image is embedded in the application, data URI not repeated here for brevity)\nHint: ${content.imageAiHint || 'N/A'}\n` : ''}
---
*Curated by Content Curator Bot on ${today}*
`;

  return `${frontmatter}\n${body}`;
}

export async function publishToGithubAction(
  content: ProcessedContent,
  githubRepoUrl: string | undefined | null
): Promise<{ success: boolean; message: string; fileUrl?: string }> {
  console.log('[Action] publishToGithubAction: Attempting to publish content ID:', content.id, 'Title:', content.title.substring(0,50)+"...", 'to Repo:', githubRepoUrl);

  if (!githubRepoUrl) {
    console.warn('[Action] publishToGithubAction: GitHub Repository URL not configured.');
    return { success: false, message: 'GitHub Repository URL not configured in Settings.' };
  }
  const githubPat = process.env.GITHUB_PAT;
  if (!githubPat) {
    console.error('[Action] publishToGithubAction: GITHUB_PAT not configured on the server.');
    return { success: false, message: 'GitHub Personal Access Token (GITHUB_PAT) not configured on the server.' };
  }

  const repoUrlMatch = githubRepoUrl.match(/github\.com\/([^\/]+)\/([^\/.]+)(\.git)?$/i);
  if (!repoUrlMatch || !repoUrlMatch[1] || !repoUrlMatch[2]) {
     console.warn('[Action] publishToGithubAction: Invalid GitHub Repository URL format.');
    return { success: false, message: 'Invalid GitHub Repository URL format. Expected: https://github.com/owner/repo' };
  }
  const owner = repoUrlMatch[1];
  const repo = repoUrlMatch[2];

  const octokit = new Octokit({ auth: githubPat });

  const markdownContent = generateMarkdownContent(content);
  const contentBase64 = Buffer.from(markdownContent).toString('base64');
  
  const slugifiedTitle = slugify(content.title || 'untitled');
  const shortId = content.id.substring(0, 8);
  const fileName = `${format(new Date(), 'yyyy-MM-dd')}-${slugifiedTitle}-${shortId}.md`;
  const filePath = `curated-content/${fileName}`;

  const commitMessage = `feat: Add/Update curated content "${content.title || 'Untitled'}" (ID: ${shortId})`;
  let existingFileSha: string | undefined = undefined;

  try {
    console.log(`[Action] publishToGithubAction: Checking for existing file at: ${owner}/${repo}/${filePath}`);
    const { data: existingFileData } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: filePath,
    });
    if (existingFileData && !Array.isArray(existingFileData) && existingFileData.type === 'file') {
      existingFileSha = existingFileData.sha;
      console.log(`[Action] publishToGithubAction: Existing file found with SHA: ${existingFileSha}. Path: ${filePath}`);
    }
  } catch (error: any) {
    if (error.status !== 404) {
      console.error(`[Action] publishToGithubAction: Error checking existing file content for ${filePath}:`, error);
      return { success: false, message: `GitHub API Error: Could not verify existing file. ${error.message}` };
    }
    console.log(`[Action] publishToGithubAction: File ${filePath} not found. Will create a new one.`);
  }

  try {
    const actionVerb = existingFileSha ? 'Updating' : 'Creating';
    console.log(`[Action] publishToGithubAction: ${actionVerb} file ${filePath} on GitHub repo ${owner}/${repo}.`);
    const { data: result } = await octokit.rest.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: filePath,
      message: commitMessage,
      content: contentBase64,
      sha: existingFileSha,
      committer: {
        name: 'Content Curator Bot',
        email: 'bot@example.com', 
      },
      author: {
        name: 'Content Curator Bot',
        email: 'bot@example.com',
      },
    });

    const fileUrl = result.content?.html_url || `https://github.com/${owner}/${repo}/blob/main/${filePath}`; 
    console.log(`[Action] publishToGithubAction: File ${existingFileSha ? 'updated' : 'created'} successfully: ${fileUrl}`);

    return { 
      success: true, 
      message: `Content "${content.title || 'Untitled'}" ${existingFileSha ? 'updated' : 'created'} on GitHub: ${fileName}`,
      fileUrl: fileUrl 
    };

  } catch (error: any) {
    console.error('[Action] publishToGithubAction: GitHub API Error during createOrUpdateFileContents:', error);
    let errorMessageText = 'Failed to publish to GitHub.';
    if (error.status === 401) {
      errorMessageText = 'GitHub API Error: Bad credentials (Invalid GITHUB_PAT or insufficient permissions).';
    } else if (error.status === 404) {
      errorMessageText = `GitHub API Error: Repository not found or path "${filePath}" issue. Ensure 'curated-content' directory exists.`;
    } else if (error.status === 409) {
       errorMessageText = `GitHub API Error: Conflict detected. If updating, the file might have changed. Path: ${filePath}`;
    } else if (error.status === 422 && error.message?.toLowerCase().includes("sha")) {
      errorMessageText = `GitHub API Error: Invalid SHA or conflict updating file. It might have been changed since last check. Path: ${filePath}`;
    } else if (error.message) {
      errorMessageText = `GitHub API Error: ${error.message}`;
    }
    return { success: false, message: errorMessageText };
  }
}


// --- Image Generation for Content ---
export type GenerateImageState = {
  message?: string | null;
  updatedContentPartial?: Pick<ProcessedContent, 'id' | 'imageUrl' | 'imageAiHint' | 'imageStatus' | 'imageErrorMessage'>;
  error?: string | null;
  contentId?: string | null;
};

export async function generateImageForContentAction(
  contentId: string,
  title: string,
  summary: string
): Promise<GenerateImageState> {
  console.log(`[Action] generateImageForContentAction: Generating image for content ID: ${contentId}, Title: ${title.substring(0, 50)}...`);

  if (!title || !summary) {
    console.warn(`[Action] generateImageForContentAction: Title or summary missing for content ID ${contentId}.`);
    return {
      error: 'Title and summary are required to generate an image.',
      contentId,
      updatedContentPartial: {
        id: contentId,
        imageStatus: 'error',
        imageErrorMessage: 'Title and summary are required.',
      }
    };
  }

  try {
    const input: GenerateIllustrativeImageInput = { title, summary };
    const result: GenerateIllustrativeImageOutput = await generateIllustrativeImage(input);
    
    const hintKeywords = title.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 2).join(' ');
    console.log(`[Action] generateImageForContentAction: Image generated successfully for content ID ${contentId}. AI Hint: ${hintKeywords}`);
    return {
      message: 'Image generated successfully.',
      contentId,
      updatedContentPartial: {
        id: contentId,
        imageUrl: result.imageDataUri,
        imageAiHint: hintKeywords || 'illustration',
        imageStatus: 'generated',
        imageErrorMessage: undefined,
      },
    };
  } catch (error: any) {
    console.error(`[Action] generateImageForContentAction: Error generating image for content ID ${contentId}:`, error);
    const errorMessageText = error.message || 'An unknown error occurred during image generation.';
    return {
      error: `Failed to generate image: ${errorMessageText}`,
      contentId,
      updatedContentPartial: {
        id: contentId,
        imageUrl: undefined,
        imageAiHint: undefined,
        imageStatus: 'error',
        imageErrorMessage: errorMessageText,
      },
    };
  }
}

