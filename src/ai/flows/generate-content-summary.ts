
// src/ai/flows/generate-content-summary.ts
'use server';

/**
 * @fileOverview This file defines a Genkit flow for generating a concise summary,
 * an engaging title, and relevant tags for newly found content.
 *
 * - generateContentSummary - A function that handles the content summarization process.
 * - GenerateContentSummaryInput - The input type for the generateContentSummary function.
 * - GenerateContentSummaryOutput - The return type for the generateContentSummary function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import {fetchWebsiteContentTool} from '@/ai/tools/fetch-website-content-tool';

const GenerateContentSummaryInputSchema = z.object({
  articleUrl: z.string().url().describe('The URL of the article to summarize.'),
  topic: z.string().describe('The topic of the teaching materials.'),
});
export type GenerateContentSummaryInput = z.infer<typeof GenerateContentSummaryInputSchema>;

const GenerateContentSummaryOutputSchema = z.object({
  title: z.string().describe('An engaging title for the content.'),
  summary: z.string().describe('A concise summary of the content (150-200 words).'),
  tags: z.array(z.string()).describe('An array of 3-5 relevant tags.'),
  source_url: z.string().describe('The original URL of the article.'),
  progress: z.string().describe('Progress of generating the summary'),
});
export type GenerateContentSummaryOutput = z.infer<typeof GenerateContentSummaryOutputSchema>;

export async function generateContentSummary(input: GenerateContentSummaryInput): Promise<GenerateContentSummaryOutput> {
  return generateContentSummaryFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateContentSummaryPrompt',
  input: {schema: GenerateContentSummaryInputSchema},
  output: {schema: GenerateContentSummaryOutputSchema},
  tools: [fetchWebsiteContentTool],
  prompt: `You are an AI teaching content editor. Your goal is to create an update proposal for a teaching website focused on the topic: {{{topic}}}.

You will be given an article URL: {{{articleUrl}}}.

VERY IMPORTANT FIRST STEP: You MUST use the 'fetchWebsiteContentTool' with the provided 'articleUrl' to retrieve the raw HTML content of the article. Do not attempt to summarize or invent content if the tool fails or returns an error; instead, your entire response should indicate the failure to fetch the content.

If the 'fetchWebsiteContentTool' is successful and returns HTML content, then proceed with the following steps:
1.  From the fetched HTML, identify and extract the main textual article content. You should try to ignore navigation menus, sidebars, advertisements, footers, and other non-article boilerplate.
2.  Based on this extracted main content, generate an attractive title (no more than 20 characters).
3.  Generate a content summary of about 150-200 characters, highlighting its value to learners for the topic '{{{topic}}}'.
4.  Extract 3-5 key tags relevant to the content and the topic.
5.  The content style should be concise and easy to understand.
6.  The original source URL ({{{articleUrl}}}) must be included in your output.

If you could not fetch or extract meaningful content from the URL using the tool, your output for title, summary, and tags should clearly state that content extraction failed. For example:
{
  "title": "Content Fetch Failed",
  "summary": "Could not retrieve or process content from the provided URL: {{{articleUrl}}}",
  "tags": ["error", "fetch-failed"],
  "source_url": "{{{articleUrl}}}",
  "progress": "Attempted to fetch content, but failed."
}

Otherwise, the successful output format MUST be JSON:
{
  "title": "suggested title",
  "summary": "content summary...",
  "tags": ["tag1", "tag2", ...],
  "source_url": "{{{articleUrl}}}",
  "progress": ""
}`,
});

const generateContentSummaryFlow = ai.defineFlow(
  {
    name: 'generateContentSummaryFlow',
    inputSchema: GenerateContentSummaryInputSchema,
    outputSchema: GenerateContentSummaryOutputSchema,
  },
  async (input: GenerateContentSummaryInput) => {
    const {output, history} = await prompt(input);

    if (!output) {
      console.error(
        'Generate content summary flow: AI did not produce the expected output. This might be due to an issue with the content fetching tool or the LLM failing to process its result. History:',
        JSON.stringify(history, null, 2)
      );
      throw new Error(
        'Failed to generate content summary. The AI model did not return the expected output.'
      );
    }
    
    // The 'progress' field should be set by the LLM as per the prompt.
    // If it's a success, it might be empty or a success message. If failure, a failure message.
    // Adding a default if LLM forgets, but it's better if LLM handles it.
    if (output.progress === "") {
       output.progress = 'Content processing attempted.';
    }
    if (output.title !== "Content Fetch Failed") {
        output.progress = 'Successfully generated title, summary, and tags after fetching content.';
    }

    return output;
  }
);

