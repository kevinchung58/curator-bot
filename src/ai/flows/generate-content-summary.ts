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

const GenerateContentSummaryInputSchema = z.object({
  articleUrl: z.string().describe('The URL of the article to summarize.'),
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
  prompt: `You are an AI teaching content editor.
  Please write an update proposal for the following webpage content [{{{articleUrl}}}] for my [{{{topic}}}] teaching website.

  Requirements:
  1. Generate an attractive title (no more than 20 characters).
  2. Generate a content summary of about 150-200 characters, highlighting its value to learners.
  3. Extract 3-5 key tags.
  4. The content style should be concise and easy to understand.
  5. The original source URL must be included.

  Output format should use JSON:
  {
    "title": "suggested title",
    "summary": "content summary...",
    "tags": ["tag1", "tag2", ...],
    "source_url": "[article URL]",
    "progress": ""
  }`,
});

const generateContentSummaryFlow = ai.defineFlow(
  {
    name: 'generateContentSummaryFlow',
    inputSchema: GenerateContentSummaryInputSchema,
    outputSchema: GenerateContentSummaryOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    // add progress message
    output!.progress = 'Generated a title, summary and tags for the new content.';
    return output!;
  }
);
