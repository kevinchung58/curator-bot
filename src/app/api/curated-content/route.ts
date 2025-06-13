import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

// Ensure that the database schema matches the select query.
// Specifically, ensure columns like 'summary', 'tags', 'image_url' exist in 'curated_content'.

export async function GET(request: Request) {
  // The `createRouteHandlerClient` is used for server-side Supabase access in Next.js App Router.
  // It correctly handles user sessions if your table has Row Level Security (RLS) based on users.
  // If the table is public or RLS is based on service roles for agent-written data, this is still a safe way to access.
  const supabase = createRouteHandlerClient({ cookies });
  const { searchParams } = new URL(request.url);

  // Default to 20 items, allow client to specify a limit.
  // Consider adding a maximum limit server-side to prevent abuse.
  const limit = parseInt(searchParams.get('limit') || '20', 10);
  // Optional: Implement page-based pagination if limit alone is not sufficient.
  // const page = parseInt(searchParams.get('page') || '1', 10);
  // const offset = (page - 1) * limit;

  try {
    const { data, error } = await supabase
      .from('curated_content')
      .select('id, source_url, title, status, agent_progress_message, agent_error_message, created_at, updated_at, summary, tags, image_url')
      .order('updated_at', { ascending: false }) // Show latest updated items first
      .limit(limit);
      // .range(offset, offset + limit - 1); // For pagination with offset

    if (error) {
      console.error('Error fetching curated content from Supabase:', error);
      return NextResponse.json({ error: error.message, details: error.details }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (e: any) {
    // Catch any other unexpected errors during the process
    console.error('Unexpected error in /api/curated-content GET handler:', e);
    return NextResponse.json({ error: e.message || 'An unexpected server error occurred' }, { status: 500 });
  }
}

// Optional: Add a POST handler or other methods if needed in the future.
// export async function POST(request: Request) { ... }
