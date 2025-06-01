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

Your output MUST strictly adhere to the following JSON format, using the specified field names.

Here is an example:

Input Curriculum:
"Introduction to Quantum Computing:
Core Concepts: Qubits, Superposition, Entanglement.
Algorithms: Shor's Algorithm, Grover's Algorithm.
Hardware: Superconducting qubits, Trapped ions."

Example JSON Output:
{
  "keywords": ["quantum computing basics", "qubit explanation", "superposition in quantum", "entanglement for beginners", "Shor's algorithm tutorial", "Grover's algorithm guide", "superconducting qubit technology", "trapped ion quantum computers", "quantum algorithm examples", "future of quantum computing"],
  "targetSites": ["https://quantum-computing.ibm.com/", "https://www.quantamagazine.org/tag/quantum-computing/", "https://arxiv.org/list/quant-ph/recent", "https://quantumai.googleblog.com/", "https://www.microsoft.com/en-us/quantum/blog"],
  "contentTypesToMonitor": ["research papers", "technical blog posts", "educational articles", "news updates", "video lectures"]
}

Now, based on the provided curriculum, generate your response in the specified JSON format.
`,
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

