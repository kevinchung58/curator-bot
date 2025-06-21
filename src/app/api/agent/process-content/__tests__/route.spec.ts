import { POST } from '../route'; // Import the POST handler
import { NextRequest } from 'next/server';
import { processDiscoveredContent } from '@/lib/actions'; // Action to be mocked
import type { ProcessedContent } from '@/lib/definitions'; // For typing mock results

// Mock the action
jest.mock('@/lib/actions', () => ({
  processDiscoveredContent: jest.fn(),
}));

// Cast the mock for TypeScript to use in tests
const mockProcessDiscoveredContent = processDiscoveredContent as jest.MockedFunction<typeof processDiscoveredContent>;

// Helper to create a mock NextRequest
const createMockRequest = (body: any, method: string = 'POST'): NextRequest => {
  const request = {
    json: async () => body,
    method: method,
    url: 'http://localhost/api/agent/process-content', // Dummy URL for the request object
    headers: new Headers({ 'Content-Type': 'application/json' }),
    // Add other NextRequest properties if needed by the handler
  } as NextRequest;
  return request;
};

describe('/api/agent/process-content POST Handler', () => {
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    mockProcessDiscoveredContent.mockReset();
    // Setup console spies
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore console spies
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  const validRequestBody = { articleId: 'id123', articleUrl: 'http://example.com/article1', topic: 'Test Topic' };

  it('should return 200 and processed content on successful action call', async () => {
    const mockOutput: ProcessedContent = {
      id: 'id123', sourceUrl: validRequestBody.articleUrl, title: 'AI Processed Title',
      summary: 'AI Summary', tags: ['ai', 'test'], status: 'processed',
      progressMessage: 'Successfully processed by AI.'
    };
    mockProcessDiscoveredContent.mockResolvedValueOnce({ processedContent: mockOutput, message: 'Processing successful' });

    const request = createMockRequest(validRequestBody);
    const response = await POST(request);
    const responseBody = await response.json();

    expect(response.status).toBe(200);
    expect(responseBody.processedContent).toEqual(mockOutput);
    expect(responseBody.message).toBe('Processing successful');
    expect(mockProcessDiscoveredContent).toHaveBeenCalledWith(
      validRequestBody.articleId,
      validRequestBody.articleUrl,
      validRequestBody.topic
    );
  });

  it('should return 200 and error details if action returns ProcessedContent with status: "error"', async () => {
    const mockErrorContent: ProcessedContent = {
      id: 'id123', sourceUrl: validRequestBody.articleUrl, title: 'Error in AI',
      summary: 'AI failed to process.', tags: ['error'], status: 'error',
      errorMessage: 'AI model returned an error.', progressMessage: 'AI processing failed.'
    };
    mockProcessDiscoveredContent.mockResolvedValueOnce({ processedContent: mockErrorContent, error: 'AI processing had an issue' });

    const request = createMockRequest(validRequestBody);
    const response = await POST(request);
    const responseBody = await response.json();

    expect(response.status).toBe(200); // The API route itself succeeded, but returned an application error from the action
    expect(responseBody.processedContent).toEqual(mockErrorContent);
    expect(responseBody.error).toBe('AI processing had an issue');
  });

  it('should return 500 if action throws an unexpected error', async () => {
    const actionError = new Error('Action failed catastrophically');
    mockProcessDiscoveredContent.mockRejectedValueOnce(actionError);

    const request = createMockRequest(validRequestBody);
    const response = await POST(request);
    const responseBody = await response.json();

    expect(response.status).toBe(500);
    expect(responseBody.error).toContain('Internal server error: Action failed catastrophically');
    expect(responseBody.processedContent).toBeNull(); // As per current API error handling
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error in /api/agent/process-content:'), actionError);
  });

  it('should return 500 if action returns an error string and no processedContent', async () => {
    const errorMessage = 'Explicit error from action, content not processed.';
    mockProcessDiscoveredContent.mockResolvedValueOnce({ error: errorMessage, message: 'Action indicated failure' });

    const request = createMockRequest(validRequestBody);
    const response = await POST(request);
    const responseBody = await response.json();

    expect(response.status).toBe(500); // As per current API error handling
    expect(responseBody.error).toBe(errorMessage);
    expect(responseBody.processedContent).toBeNull();
  });

  it('should return 400 for invalid request body (missing articleUrl)', async () => {
    const invalidBody = { articleId: 'id1', topic: 'test' }; // articleUrl is missing
    const request = createMockRequest(invalidBody);
    const response = await POST(request);
    const responseBody = await response.json();

    expect(response.status).toBe(400);
    expect(responseBody.error).toContain('Invalid request payload');
    expect(responseBody.error).toContain("Field 'articleUrl' is required");
    expect(mockProcessDiscoveredContent).not.toHaveBeenCalled();
  });

  it('should return 400 for invalid request body (invalid articleUrl format)', async () => {
    const invalidBody = { articleId: 'id1', articleUrl: 'not-a-valid-url', topic: 'test' };
    const request = createMockRequest(invalidBody);
    const response = await POST(request);
    const responseBody = await response.json();

    expect(response.status).toBe(400);
    expect(responseBody.error).toContain('Invalid request payload');
    expect(responseBody.error).toContain("Invalid URL format for 'articleUrl'");
    expect(mockProcessDiscoveredContent).not.toHaveBeenCalled();
  });

  it('should return 400 for invalid request body (articleId not a string)', async () => {
    const invalidBody = { articleId: 123, articleUrl: 'http://example.com', topic: 'test' };
    const request = createMockRequest(invalidBody);
    const response = await POST(request);
    const responseBody = await response.json();

    expect(response.status).toBe(400);
    expect(responseBody.error).toContain('Invalid request payload');
    expect(responseBody.error).toContain("Field 'articleId' must be a string");
    expect(mockProcessDiscoveredContent).not.toHaveBeenCalled();
  });


  it('should return 500 if request.json() fails (e.g., invalid JSON)', async () => {
    const request = {
      json: async () => { throw new Error('Simulated invalid JSON'); },
      method: 'POST',
      url: 'http://localhost/api/agent/process-content',
      headers: new Headers({ 'Content-Type': 'application/json' }),
    } as NextRequest;

    const response = await POST(request);
    const responseBody = await response.json();

    expect(response.status).toBe(500);
    expect(responseBody.error).toContain('Internal server error: Simulated invalid JSON');
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error parsing request body:'), expect.any(Error));
  });
});
