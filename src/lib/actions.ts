
'use server';

import { formulateSearchStrategy, FormulateSearchStrategyInput, FormulateSearchStrategyOutput } from '@/ai/flows/formulate-search-strategy';
import { generateContentSummary, GenerateContentSummaryInput, GenerateContentSummaryOutput } from '@/ai/flows/generate-content-summary';
import type { SearchStrategy, ProcessedContent, AppSettings } from './definitions';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';

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
    console.error('Error processing content:', error);
    const errorMessage = error.message || 'An unknown error occurred during content processing.';
    return {
      error: `Error: Could not process content. ${errorMessage}`.trim(),
      articleId: articleId,
      processedContent: {
        id: articleId,
        sourceUrl: articleUrl,
        title: 'Processing Error',
        summary: `Failed to process: ${errorMessage}`,
        tags: ['error'],
        status: 'error',
        progressMessage: `System error during processing: ${errorMessage}`,
        errorMessage: `System error: ${errorMessage}`,
      }
    };
  }
}


// --- Settings ---
// User preferences are saved to localStorage on the client-side.
// Sensitive API keys should be set as environment variables on the server.
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
      errors: validatedFields.error.flatten().fieldErrors as any, // Cast to any due to Zod's complex error types
      message: 'Validation Error: Please check your input.',
    };
  }

  // These settings are intended to be saved in localStorage by the client.
  // No server-side persistence for these specific fields in this action.
  console.log("User preferences received (to be saved by client):", validatedFields.data);

  return {
    message: 'User preferences updated. They will be saved in your browser.',
    settings: validatedFields.data as AppSettings,
  };
}

// --- Placeholder for LINE Bot action ---
export async function sendToLineAction(content: ProcessedContent): Promise<{ message: string }> {
  // This is a placeholder. Actual LINE Bot integration is complex.
  // It would retrieve LINE_USER_ID from settings (localStorage via client) and LINE_CHANNEL_ACCESS_TOKEN from env vars.
  console.log("Sending to LINE (simulated):", content);
  return { message: `Content "${content.title}" sent to LINE (simulated).` };
}
