import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const url = request.nextUrl.searchParams.get('url');

    if (!url) {
      return NextResponse.json(
        { error: 'Missing url parameter' },
        { status: 400 }
      );
    }

    const response = await fetch(url);

    if (!response.ok) {
      console.error('Failed to fetch image:', response.status, response.statusText);
      return NextResponse.json(
        { error: 'Failed to fetch image', status: response.status },
        { status: 502 }
      );
    }

    const imageBuffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'image/png';

    return new NextResponse(imageBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    console.error('Error in image proxy:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 502 }
    );
  }
}
