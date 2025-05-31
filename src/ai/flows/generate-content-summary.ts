
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
  summary: z.string().describe('A concise summary of the content.'),
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

VERY IMPORTANT FIRST STEP: You MUST use the 'fetchWebsiteContentTool' with the provided 'articleUrl' to retrieve the raw HTML content of the article. Your progress message should reflect this attempt (e.g., "Fetching content from URL...").

If the 'fetchWebsiteContentTool' fails or returns an error, your entire response MUST indicate the failure to fetch the content. The progress message should reflect this failure. For example:
{
  "title": "Content Fetch Failed",
  "summary": "Could not retrieve or process content from the provided URL: {{{articleUrl}}}",
  "tags": ["error", "fetch-failed"],
  "source_url": "{{{articleUrl}}}",
  "progress": "Failed to fetch content from URL after attempting."
}

If the 'fetchWebsiteContentTool' is successful and returns HTML content, then proceed with the following steps:
1.  Set your progress message to "Extracting main content from HTML...".
2.  From the fetched HTML, identify and extract the main textual article content. You should try to ignore navigation menus, sidebars, advertisements, footers, and other non-article boilerplate.
3.  If meaningful textual content cannot be extracted from the HTML (e.g., it's primarily a video page, an image gallery, a login wall, or the HTML structure is too complex to parse reliably), then your output for title, summary, and tags MUST reflect this. The progress message should indicate this outcome. For example:
    {
      "title": "Content Extraction Failed",
      "summary": "Successfully fetched HTML, but could not extract meaningful textual article content from the page: {{{articleUrl}}}",
      "tags": ["error", "extraction-failed"],
      "source_url": "{{{articleUrl}}}",
      "progress": "Fetched HTML, but no meaningful article text found or extracted."
    }
4.  If main textual content IS successfully extracted:
    a.  Set your progress message to "Generating title, summary, and tags based on extracted content...".
    b.  Based on this extracted main content, generate an attractive and concise title (ideally under 60 characters, and relevant to the extracted text).
    c.  Generate a content summary of about 150-250 words, highlighting its value to learners for the topic '{{{topic}}}', based on the extracted text.
    d.  Extract 3-5 key tags relevant to the extracted content and the topic.
    e.  The content style should be concise and easy to understand.
    f.  The original source URL ({{{articleUrl}}}) must be included in your output.
    g.  Set your final progress message to "Successfully generated title, summary, and tags from extracted content."

The successful output format (after successful extraction and generation) MUST be JSON:
{
  "title": "suggested title",
  "summary": "content summary...",
  "tags": ["tag1", "tag2", ...],
  "source_url": "{{{articleUrl}}}",
  "progress": "Successfully generated title, summary, and tags from extracted content."
}`,
  config: {
    safetySettings: [
      {
        category: 'HARM_CATEGORY_HATE_SPEECH',
        threshold: 'BLOCK_MEDIUM_AND_ABOVE',
      },
      {
        category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
        threshold: 'BLOCK_MEDIUM_AND_ABOVE',
      },
      {
        category: 'HARM_CATEGORY_HARASSMENT',
        threshold: 'BLOCK_MEDIUM_AND_ABOVE',
      },
      {
        category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
        threshold: 'BLOCK_MEDIUM_AND_ABOVE',
      },
    ],
  },
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
        'Generate content summary flow: AI did not produce the expected output structure. This might be due to an issue with the content fetching tool or the LLM failing to process its result. History:',
        JSON.stringify(history, null, 2)
      );
      // This error will be caught by the calling server action.
      // The action should then set a generic error message.
      throw new Error(
        'Failed to generate content summary. The AI model did not return the expected output structure.'
      );
    }
    
    // The LLM is now primarily responsible for the progress message as per the prompt.
    // Add a fallback if the progress message is unexpectedly empty or undefined.
    if (output.progress === undefined || output.progress.trim() === "") {
       output.progress = 'Content processing result received from AI, but progress message was empty.'; 
    }

    return output;
  }
);

