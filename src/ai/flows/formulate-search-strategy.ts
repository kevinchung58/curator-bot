// formulate-search-strategy.ts
'use server';

/**
 * @fileOverview An AI agent that formulates search strategies based on teaching curriculum.
 *
 * - formulateSearchStrategy - A function that formulates search strategies.
 * - FormulateSearchStrategyInput - The input type for the formulateSearchStrategy function.
 * - FormulateSearchStrategyOutput - The return type for the formulateSearchStrategy function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const FormulateSearchStrategyInputSchema = z.object({
  curriculum: z
    .string()
    .describe('The teaching curriculum or syllabus to base the search strategy on.'),
});
export type FormulateSearchStrategyInput = z.infer<typeof FormulateSearchStrategyInputSchema>;

const FormulateSearchStrategyOutputSchema = z.object({
  keywords: z.array(z.string()).describe('An array of relevant search keywords.'),
  targetSites: z.array(z.string()).describe('An array of target websites to monitor.'),
  contentTypesToMonitor: z
    .array(z.string())
    .describe('An array of content types to monitor (e.g., news, articles, code examples).'),
});
export type FormulateSearchStrategyOutput = z.infer<typeof FormulateSearchStrategyOutputSchema>;

export async function formulateSearchStrategy(
  input: FormulateSearchStrategyInput
): Promise<FormulateSearchStrategyOutput> {
  return formulateSearchStrategyFlow(input);
}

const formulateSearchStrategyPrompt = ai.definePrompt({
  name: 'formulateSearchStrategyPrompt',
  input: {schema: FormulateSearchStrategyInputSchema},
  output: {schema: FormulateSearchStrategyOutputSchema},
  prompt: `You are an AI teaching content curation assistant. Based on the provided teaching curriculum, you will recommend relevant search keywords, target websites, and content types to monitor for new learning materials.

Curriculum:
{{{curriculum}}}

Please provide:
1.  5-10 relevant search keywords.
2.  3-5 high-quality websites, blogs, or resource platforms to monitor regularly.
3.  Content types to monitor (e.g., news, teaching articles, code examples, academic paper abstracts).

Output format should be JSON:
{
  "keywords": ["keyword1", "keyword2", ...],
  "target_sites": ["url1", "url2", ...],
  "content_types_to_monitor": ["type1", "type2", ...]
}`,
});

const formulateSearchStrategyFlow = ai.defineFlow(
  {
    name: 'formulateSearchStrategyFlow',
    inputSchema: FormulateSearchStrategyInputSchema,
    outputSchema: FormulateSearchStrategyOutputSchema,
  },
  async input => {
    const {output} = await formulateSearchStrategyPrompt(input);
    return output!;
  }
);
