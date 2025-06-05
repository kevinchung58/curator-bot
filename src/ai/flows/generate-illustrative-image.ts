
'use server';
/**
 * @fileOverview Generates an illustrative image for content.
 *
 * - generateIllustrativeImage - A function that generates an image.
 * - GenerateIllustrativeImageInput - Input type.
 * - GenerateIllustrativeImageOutput - Output type.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GenerateIllustrativeImageInputSchema = z.object({
  title: z.string().describe('The title of the content.'),
  summary: z.string().describe('The summary of the content.'),
});
export type GenerateIllustrativeImageInput = z.infer<typeof GenerateIllustrativeImageInputSchema>;

const GenerateIllustrativeImageOutputSchema = z.object({
  imageDataUri: z.string().describe('The generated image as a data URI. Expected format: \'data:<mimetype>;base64,<encoded_data>\'.'),
});
export type GenerateIllustrativeImageOutput = z.infer<typeof GenerateIllustrativeImageOutputSchema>;

export async function generateIllustrativeImage(input: GenerateIllustrativeImageInput): Promise<GenerateIllustrativeImageOutput> {
  return generateIllustrativeImageFlow(input);
}

const generateIllustrativeImageFlow = ai.defineFlow(
  {
    name: 'generateIllustrativeImageFlow',
    inputSchema: GenerateIllustrativeImageInputSchema,
    outputSchema: GenerateIllustrativeImageOutputSchema,
  },
  async (input) => {
    console.log('[AI Flow] generateIllustrativeImageFlow: Invoked with input title excerpt:', input.title.substring(0,100) + "...");
    try {
      console.log('[AI Flow] generateIllustrativeImageFlow: Calling ai.generate for image...');
      const {media} = await ai.generate({
        model: 'googleai/gemini-2.0-flash-exp', 
        prompt: `Generate a visually appealing and relevant illustrative image for an article titled "${input.title}" with the following summary: "${input.summary}". The image should be suitable for a blog post or social media. Avoid text in the image unless it's part of a natural scene or illustrative concept (like a sign or book cover). The style should be modern and engaging. Make it 600x400 pixels.`,
        config: {
          responseModalities: ['TEXT', 'IMAGE'], 
        },
      });

      if (media && media.url) {
        console.log('[AI Flow] generateIllustrativeImageFlow: Image generation successful. Media URL (excerpt):', media.url.substring(0,100) + "...");
        return { imageDataUri: media.url };
      } else {
        console.error('[AI Flow] generateIllustrativeImageFlow: No media URL in response from image generation model.');
        throw new Error('Image generation failed: No media URL returned by the model.');
      }
    } catch (error: any) {
      console.error('[AI Flow] generateIllustrativeImageFlow: Error during image generation:', error);
      const originalErrorMessage = error.message || 'An unknown error occurred during image generation.';
      throw new Error(`Image generation flow failed: ${originalErrorMessage}`);
    }
  }
);

