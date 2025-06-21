import { generateIllustrativeImageFlow } from '../generate-illustrative-image'; // Named export of the flow
import type { GenerateIllustrativeImageInput } from '../generate-illustrative-image'; // Type
import { ai } from '@/ai/genkit'; // To mock ai.generate

// Mock ai.generate specifically
const mockAiGenerate = jest.fn();

jest.mock('@/ai/genkit', () => {
  const actualGenkitAi = jest.requireActual('@/ai/genkit').ai; // Get actual 'ai' object
  return {
    ai: {
      ...actualGenkitAi, // Spread all actual 'ai' properties
      generate: mockAiGenerate, // Override only 'generate' with our mock
    },
  };
});

// Helper function for creating mock input
const createMockInput = (overrides: Partial<GenerateIllustrativeImageInput> = {}): GenerateIllustrativeImageInput => ({
  title: 'Test Title for Image',
  summary: 'Test summary for image generation to guide the AI model.',
  // Add any other default fields if the input schema requires them
  ...overrides,
});

describe('generateIllustrativeImageFlow', () => {
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    mockAiGenerate.mockReset();
    // Setup console spies
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore console spies
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  const sampleInput = createMockInput();
  const mockDataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='; // 1x1 transparent PNG

  it('should return imageDataUri on successful image generation', async () => {
    mockAiGenerate.mockResolvedValueOnce({
      candidates: [{
        index: 0,
        finishReason: 'STOP',
        message: { role: 'model', content: [{ media: { url: mockDataUri, contentType: 'image/png' } }] }
      }]
    });

    const result = await generateIllustrativeImageFlow(sampleInput);

    expect(mockAiGenerate).toHaveBeenCalledWith(expect.objectContaining({
      prompt: expect.stringContaining(sampleInput.title),
      // model: 'gemini-1.5-flash', // Or whatever model is specified in the flow
      // config: expect.any(Object), // Check specific config if necessary
      // outputFormat: 'dataUri', // This is implicitly tested by the expected output structure
    }));
    expect(result).toEqual({ imageDataUri: mockDataUri });
    expect(consoleLogSpy).toHaveBeenCalledWith(`Successfully generated image for title: "${sampleInput.title}"`);
  });

  it('should throw an error if ai.generate response has no candidates', async () => {
    mockAiGenerate.mockResolvedValueOnce({ candidates: [] }); // No candidates

    await expect(generateIllustrativeImageFlow(sampleInput)).rejects.toThrow(
      'Image generation failed: No candidates returned by the model.'
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Image generation flow failed for input:', sampleInput,
      expect.stringContaining('Error: Image generation failed: No candidates returned by the model.')
    );
  });

  it('should throw an error if ai.generate candidate has no message', async () => {
    mockAiGenerate.mockResolvedValueOnce({ candidates: [{ index:0, finishReason: 'STOP' }] } as any);
    await expect(generateIllustrativeImageFlow(sampleInput)).rejects.toThrow(
      'Image generation failed: No message in candidate returned by the model.'
    );
  });

  it('should throw an error if ai.generate candidate message has no content', async () => {
    mockAiGenerate.mockResolvedValueOnce({ candidates: [{ index:0, finishReason: 'STOP', message: {role:'model'} }] } as any);
    await expect(generateIllustrativeImageFlow(sampleInput)).rejects.toThrow(
      'Image generation failed: No content in message returned by the model.'
    );
  });

  it('should throw an error if ai.generate returns no media object in the first candidate part', async () => {
    mockAiGenerate.mockResolvedValueOnce({
      candidates: [{
        index: 0,
        finishReason: 'STOP',
        message: { role: 'model', content: [{ text: 'no media here' }] } // No media part
      }]
    });

    await expect(generateIllustrativeImageFlow(sampleInput)).rejects.toThrow(
      'Image generation failed: No media part in the first content block of the candidate.'
    );
  });

  it('should throw an error if ai.generate returns media but no media.url', async () => {
    mockAiGenerate.mockResolvedValueOnce({
      candidates: [{
        index: 0,
        finishReason: 'STOP',
        message: { role: 'model', content: [{ media: { contentType: 'image/png' } }] } // Media object exists, but no url
      }]
    });
    await expect(generateIllustrativeImageFlow(sampleInput)).rejects.toThrow(
      'Image generation failed: No media URL in media part returned by the model.'
    );
  });

  it('should throw a wrapped error if ai.generate itself throws an error with a message', async () => {
    const originalError = new Error('AI Model Quota Exceeded');
    mockAiGenerate.mockRejectedValueOnce(originalError);

    await expect(generateIllustrativeImageFlow(sampleInput)).rejects.toThrow(
      `Image generation flow failed: ${originalError.message}`
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Image generation flow failed for input:', sampleInput,
      originalError // The original error should be logged
    );
  });

  it('should throw a generic wrapped error if ai.generate throws an error without a message property', async () => {
    const errorWithoutMessage = { someOtherProperty: 'details' }; // Not an Error instance
    mockAiGenerate.mockRejectedValueOnce(errorWithoutMessage);

    await expect(generateIllustrativeImageFlow(sampleInput)).rejects.toThrow(
      'Image generation flow failed: An unknown error occurred during image generation.'
    );
     expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Image generation flow failed for input:', sampleInput,
      errorWithoutMessage
    );
  });
});
