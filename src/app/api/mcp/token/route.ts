import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { email, serverUrl } = await request.json();

    if (!email || !serverUrl) {
      return NextResponse.json(
        { success: false, error: 'Email and server URL are required' },
        { status: 400 }
      );
    }

    // Derive the base URL from the SSE URL (strip /sse suffix)
    const baseUrl = serverUrl.replace(/\/sse\/?$/, '');

    const response = await fetch(`${baseUrl}/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return NextResponse.json(
        { success: false, error: `Server responded ${response.status}: ${errText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json({ success: true, ...data });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to generate token' },
      { status: 500 }
    );
  }
}
