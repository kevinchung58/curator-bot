import { formulateSearchStrategyFlow } from '../formulate-search-strategy'; // Named export of the flow
import type { FormulateSearchStrategyInput, FormulateSearchStrategyOutput } from '../formulate-search-strategy'; // Types
import { ai } from '@/ai/genkit'; // To mock ai.definePrompt

// Mock the prompt function returned by ai.definePrompt
const mockFormulateSearchStrategyPromptFn = jest.fn();

jest.mock('@/ai/genkit', () => ({
  ai: {
    definePrompt: jest.fn(() => mockFormulateSearchStrategyPromptFn),
    // Mock other ai utilities if formulateSearchStrategy uses them directly
  },
}));

// Helper function for creating mock input
const createMockInput = (curriculum: string): FormulateSearchStrategyInput => ({
  curriculum,
});

describe('formulateSearchStrategyFlow', () => {
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance; // For error logging if any

  beforeEach(() => {
    mockFormulateSearchStrategyPromptFn.mockReset();
    // Setup console spies
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore console spies
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  const sampleCurriculum = 'Learn about Next.js and Server Components';
  const expectedOutput: FormulateSearchStrategyOutput = {
    keywords: ['Next.js', 'Server Components', 'React'],
    targetSites: ['nextjs.org', 'react.dev', 'vercel.com/blog'],
    contentTypesToMonitor: ['blog posts', 'documentation', 'tutorials'],
  };

  it('should return a valid search strategy when the prompt function succeeds', async () => {
    const input = createMockInput(sampleCurriculum);
    // Simulate the structure returned by a Genkit prompt execution
    mockFormulateSearchStrategyPromptFn.mockResolvedValueOnce({
        output: expectedOutput,
        history: [{ role: 'user', parts: [{text: 'input'}] }, { role: 'model', parts: [{text: JSON.stringify(expectedOutput)}] }]
    });

    const result = await formulateSearchStrategyFlow(input);

    expect(mockFormulateSearchStrategyPromptFn).toHaveBeenCalledWith(input);
    expect(result).toEqual(expectedOutput);
    expect(consoleLogSpy).toHaveBeenCalledWith(`Search strategy formulated for curriculum: "${sampleCurriculum}"`);
    expect(consoleLogSpy).toHaveBeenCalledWith('Formulated Strategy:', expectedOutput);
  });

  it('should throw an error if the prompt function returns output: null', async () => {
    const input = createMockInput(sampleCurriculum);
    // The actual error might be a TypeError due to `output!` if `output` is null.
    // Or Genkit flow itself might throw if Zod validation fails on null output when schema expects object.
    // The flow uses `return output!`, so it would be a TypeError if prompt returns null.
    mockFormulateSearchStrategyPromptFn.mockResolvedValueOnce({ output: null, history: [] });

    await expect(formulateSearchStrategyFlow(input)).rejects.toThrow(
      // This specific error message comes from the flow's own error handling
      "Failed to formulate search strategy. The AI model did not return the expected output structure."
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('formulateSearchStrategyFlow failed:'), // Check for the specific log
        expect.anything() // Error object
    );
  });

  it('should throw an error if the prompt function returns output: undefined', async () => {
    const input = createMockInput(sampleCurriculum);
    // Simulate the prompt execution result being malformed (missing output field)
    mockFormulateSearchStrategyPromptFn.mockResolvedValueOnce({ history: [] } as any); // Cast to any

    await expect(formulateSearchStrategyFlow(input)).rejects.toThrow(
      "Failed to formulate search strategy. The AI model did not return the expected output structure."
    );
     expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('formulateSearchStrategyFlow failed:'),
        expect.anything()
    );
  });

  it('should return the output as is if some optional fields are missing but required ones are present (if schema allows)', async () => {
    // Assuming FormulateSearchStrategyOutputSchema marks some fields as optional,
    // or the prompt somehow returns an object that's valid for the type but not "complete".
    // The current FormulateSearchStrategyOutputSchema has all fields as required (arrays of strings).
    // So, if the LLM omits a required field, Zod validation by Genkit *should* ideally catch it before the flow gets it.
    // This test checks if the flow itself adds defaults or just returns what it gets if Genkit's validation passed (e.g. if schema changed to optional).
    const input = createMockInput(sampleCurriculum);
    const partialOutput = {
      keywords: ['Next.js only'],
      // targetSites is missing
      // contentTypesToMonitor is missing
    };
    // To test this, we'd assume the Zod schema FormulateSearchStrategyOutputSchema allows these fields to be optional.
    // If not, Genkit's `definePrompt` with that schema should throw an error before our flow code even runs.
    // The flow itself has `return output!`, so it doesn't do further validation or defaulting.

    mockFormulateSearchStrategyPromptFn.mockResolvedValueOnce({ output: partialOutput as any, history: [] });

    // If FormulateSearchStrategyOutputSchema is strict (all fields required), Genkit's prompt execution
    // should ideally throw a Zod validation error if the LLM output doesn't conform.
    // Our flow's catch block would then catch that.
    // If we assume the schema was changed to make fields optional, then this test is valid for the flow's logic.
    // Let's test the scenario where the output is technically valid by the schema but incomplete.
    // For the current schema (all fields required string[]), this should ideally fail at Genkit's validation layer.
    // The flow's current error handling catches if `output` itself is null/undefined.

    // Assuming the schema was (for this test):
    // keywords: z.string().array(), targetSites: z.string().array().optional(), contentTypesToMonitor: z.string().array().optional()
    // Then the flow would return the partial output.
    const result = await formulateSearchStrategyFlow(input);
    expect(result).toEqual(partialOutput); // The flow returns what the (mocked) prompt function gives it, assuming it passed schema validation.
    expect(consoleLogSpy).toHaveBeenCalledWith('Formulated Strategy:', partialOutput);
  });

  it('should still throw error if prompt function itself throws an error', async () => {
    const input = createMockInput(sampleCurriculum);
    const promptError = new Error("Simulated LLM API Error");
    mockFormulateSearchStrategyPromptFn.mockRejectedValueOnce(promptError);

    await expect(formulateSearchStrategyFlow(input)).rejects.toThrow(promptError);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('formulateSearchStrategyFlow failed:'),
        promptError
    );
  });
});
