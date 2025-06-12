
// src/app/api/agent/process-content/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { processDiscoveredContent } from '@/lib/actions';
import type { ProcessedContent } from '@/lib/definitions';
import { z } from 'zod';

// Define types for the API request and response, matching agent-script.ts
const AgentProcessApiRequestSchema = z.object({
  articleId: z.string().min(1),
  articleUrl: z.string().url(),
  topic: z.string().min(1),
});

interface AgentProcessApiResponse {
  message?: string | null;
  processedContent?: ProcessedContent | null;
  error?: string | null;
  articleId?: string | null;
}

export async function POST(request: NextRequest) {
  console.log('[API Endpoint] /api/agent/process-content: Received POST request.');
  try {
    const body = await request.json();
    console.log('[API Endpoint] /api/agent/process-content: Request body:', body);

    const validationResult = AgentProcessApiRequestSchema.safeParse(body);

    if (!validationResult.success) {
      console.error('[API Endpoint] /api/agent/process-content: Invalid request body:', validationResult.error.flatten());
      return NextResponse.json<AgentProcessApiResponse>(
        {
          error: 'Invalid request payload. Required fields: articleId, articleUrl, topic.',
          articleId: body?.articleId || null,
        },
        { status: 400 }
      );
    }

    const { articleId, articleUrl, topic } = validationResult.data;

    console.log(`[API Endpoint] /api/agent/process-content: Calling processDiscoveredContent for articleId: ${articleId}, URL: ${articleUrl}`);
    const result = await processDiscoveredContent(articleId, articleUrl, topic);
    console.log(`[API Endpoint] /api/agent/process-content: processDiscoveredContent result for articleId: ${articleId}:`, result.processedContent ? {title: result.processedContent.title, status: result.processedContent.status} : result.error);


    if (result.error || !result.processedContent) {
      return NextResponse.json<AgentProcessApiResponse>(
        {
          message: result.message || 'Processing failed at action level.',
          error: result.error || 'Unknown error from processDiscoveredContent action.',
          processedContent: result.processedContent || null, // Could be an error-state content object
          articleId: articleId,
        },
        { status: result.processedContent && result.processedContent.status === 'error' ? 200 : 500 } // if action returns ProcessedContent with status error, it's not a 500
      );
    }

    return NextResponse.json<AgentProcessApiResponse>(
        {
            message: result.message || 'Content processed successfully.',
            processedContent: result.processedContent,
            error: null,
            articleId: articleId
        },
        { status: 200 }
    );

  } catch (error: any) {
    console.error('[API Endpoint] /api/agent/process-content: Unhandled error in API route:', error);
    return NextResponse.json<AgentProcessApiResponse>(
      {
        error: `Internal server error: ${error.message || 'Unknown error occurred.'}`,
        articleId: null, // articleId might not be available if parsing request.json() itself fails
      },
      { status: 500 }
    );
  }
}
