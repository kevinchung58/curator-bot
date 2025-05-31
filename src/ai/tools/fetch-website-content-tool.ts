
/**
 * @fileOverview A Genkit tool to fetch website content.
 *
 * - fetchWebsiteContentTool - Fetches raw HTML content from a given URL.
 */
import {ai} from '@/ai/genkit';
import {z} from 'genkit';

export const FetchWebsiteContentInputSchema = z.object({
  url: z.string().url().describe('The URL of the website to fetch content from.'),
});
export type FetchWebsiteContentInput = z.infer<typeof FetchWebsiteContentInputSchema>;

export const FetchWebsiteContentOutputSchema = z.object({
  htmlContent: z.string().describe('The fetched HTML content of the website.'),
});
export type FetchWebsiteContentOutput = z.infer<typeof FetchWebsiteContentOutputSchema>;

export const fetchWebsiteContentTool = ai.defineTool(
  {
    name: 'fetchWebsiteContentTool',
    description: 'Fetches the raw HTML content from a given URL. Use this tool to get the content of an article before summarizing it.',
    inputSchema: FetchWebsiteContentInputSchema,
    outputSchema: FetchWebsiteContentOutputSchema,
  },
  async (input: FetchWebsiteContentInput) => {
    try {
      const response = await fetch(input.url);
      if (!response.ok) {
        // Construct a more informative error message
        const errorText = await response.text().catch(() => 'Could not read error response body.');
        console.error(`Failed to fetch URL: ${input.url}, Status: ${response.status} ${response.statusText}, Body: ${errorText}`);
        throw new Error(`Failed to fetch URL '${input.url}': ${response.status} ${response.statusText}. Response body: ${errorText.substring(0, 200)}...`);
      }
      const htmlContent = await response.text();
      return { htmlContent };
    } catch (error: any) {
      console.error(`Error in fetchWebsiteContentTool for URL '${input.url}': ${error.message}`);
      // Re-throw the error so Genkit can handle it and potentially pass error information to the LLM.
      throw new Error(`Failed to fetch and process URL '${input.url}': ${error.message}`);
    }
  }
);
