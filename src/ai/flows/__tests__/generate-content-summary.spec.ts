import { generateContentSummaryFlow } from '../generate-content-summary'; // Named export of the flow itself
import { GenerateContentSummaryInputSchema, GenerateContentSummaryOutputSchema } from '../generate-content-summary'; // Zod schemas for types
import type { GenerateContentSummaryInput } from '../generate-content-summary'; // Actual type
import { ai } from '@/ai/genkit'; // To mock ai.definePrompt

// Mock the prompt function returned by ai.definePrompt
const mockPromptFunction = jest.fn();

jest.mock('@/ai/genkit', () => ({
  ai: {
    definePrompt: jest.fn(() => mockPromptFunction),
    // Mock other ai utilities if generateContentSummary uses them directly
  },
}));

// Helper function for creating mock input
const createMockInput = (overrides: Partial<GenerateContentSummaryInput> = {}): GenerateContentSummaryInput => ({
  articleUrl: 'http://example.com/article',
  topic: 'Test Topic',
  ...overrides,
});

describe('generateContentSummaryFlow', () => {
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance; // If warnings are used

  beforeEach(() => {
    mockPromptFunction.mockReset();
    // Setup console spies
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore console spies
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  it('should return successful summarization output when prompt function succeeds', async () => {
    const input = createMockInput();
    const mockOutputData = {
      title: 'Mock Title',
      summary: 'Mock Summary of the article content.',
      tags: ['tag1', 'tag2'],
      source_url: input.articleUrl,
      progress: 'Successfully generated content summary and tags.',
      // other fields like image_url, image_status can be undefined if not part of this specific mock
    };
    // Simulate the structure returned by a Genkit prompt execution
    mockPromptFunction.mockResolvedValueOnce({
        output: mockOutputData,
        history: [{ role: 'user', parts: [{text: 'input'}] }, { role: 'model', parts: [{text: 'output'}] }]
    });

    const result = await generateContentSummaryFlow(input);

    expect(mockPromptFunction).toHaveBeenCalledWith(input);
    expect(result).toEqual(mockOutputData);
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`Content summarization for ${input.articleUrl} completed.`));
  });

  it('should reflect tool call failure if prompt output indicates fetch failure', async () => {
    const input = createMockInput();
    const fetchFailOutput = {
      title: 'Content Fetch Failed',
      summary: 'Could not retrieve content from the specified URL.',
      tags: ['error', 'fetch-failed'],
      source_url: input.articleUrl,
      progress: 'Failed to fetch content from URL.',
    };
    mockPromptFunction.mockResolvedValueOnce({ output: fetchFailOutput, history: [] });

    const result = await generateContentSummaryFlow(input);

    expect(mockPromptFunction).toHaveBeenCalledWith(input);
    expect(result).toEqual(fetchFailOutput);
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`Content summarization for ${input.articleUrl} completed (with fetch failure).`));
  });

  it('should reflect content extraction failure if prompt output indicates extraction issues', async () => {
    const input = createMockInput();
    const extractionFailOutput = {
      title: 'Content Extraction Failed',
      summary: 'Successfully fetched HTML, but could not extract meaningful article text.',
      tags: ['error', 'extraction-failed'],
      source_url: input.articleUrl,
      progress: 'Fetched HTML, but no meaningful article text was extracted.',
    };
    mockPromptFunction.mockResolvedValueOnce({ output: extractionFailOutput, history: [] });

    const result = await generateContentSummaryFlow(input);

    expect(mockPromptFunction).toHaveBeenCalledWith(input);
    expect(result).toEqual(extractionFailOutput);
     expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`Content summarization for ${input.articleUrl} completed (with extraction failure).`));
  });

  it('should throw an error if the prompt function returns no output', async () => {
    const input = createMockInput();
    mockPromptFunction.mockResolvedValueOnce({ output: null, history: [{role: 'user', parts:[]}] });

    await expect(generateContentSummaryFlow(input)).rejects.toThrow(
      'Failed to generate content summary. The AI model did not return the expected output structure.'
    );
    expect(mockPromptFunction).toHaveBeenCalledWith(input);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'generateContentSummaryFlow failed: Error: Failed to generate content summary. The AI model did not return the expected output structure.',
      expect.stringContaining('Input:'), // Check for input logging
      expect.stringContaining('History:'), // Check for history logging
      expect.anything() // Stack trace
    );
  });

  it('should throw an error if the prompt function returns undefined output', async () => {
    const input = createMockInput();
    // Genkit prompt execution result should always have an 'output' field, even if it's null.
    // If 'output' itself is undefined on the result object, that's a more fundamental issue.
    mockPromptFunction.mockResolvedValueOnce({ history: [{role: 'user', parts:[]}] } as any); // Cast to any to simulate malformed result

    await expect(generateContentSummaryFlow(input)).rejects.toThrow(
      'Failed to generate content summary. The AI model did not return the expected output structure.'
    );
    expect(mockPromptFunction).toHaveBeenCalledWith(input);
    expect(consoleErrorSpy).toHaveBeenCalled();
  });


  it('should set fallback progress message if prompt output.progress is an empty string', async () => {
    const input = createMockInput();
    const mockOutputData = {
      title: 'Test Title', summary: 'Test Summary', tags: ['test'], source_url: input.articleUrl,
      progress: '', // Empty progress
    };
    mockPromptFunction.mockResolvedValueOnce({ output: mockOutputData, history: [] });

    const result = await generateContentSummaryFlow(input);
    expect(result.progress).toBe('Content processing result received from AI, but progress message was empty.');
  });

  it('should set fallback progress message if prompt output.progress is undefined', async () => {
    const input = createMockInput();
    const mockOutputData = {
      title: 'Test Title', summary: 'Test Summary', tags: ['test'], source_url: input.articleUrl,
      progress: undefined, // Undefined progress
    };
    mockPromptFunction.mockResolvedValueOnce({ output: mockOutputData, history: [] });

    const result = await generateContentSummaryFlow(input);
    expect(result.progress).toBe('Content processing result received from AI, but progress message was empty.');
  });
});
