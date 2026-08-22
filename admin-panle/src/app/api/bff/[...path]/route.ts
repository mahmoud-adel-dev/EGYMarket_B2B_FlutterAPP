import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const API_BASE = process.env.API_BASE_URL ?? 'http://localhost:3000';
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'content-encoding',
  'content-length',
]);

type BffContext = { params: Promise<{ path: string[] }> };

async function forward(request: NextRequest, context: BffContext): Promise<Response> {
  const { path } = await context.params;
  const segments = path.join('/');
  const target = `${API_BASE}/api/${segments}${request.nextUrl.search}`;

  const headers = new Headers();
  const cookie = request.headers.get('cookie');
  if (cookie) headers.set('cookie', cookie);
  const contentType = request.headers.get('content-type');
  if (contentType) headers.set('content-type', contentType);
  headers.set('accept', 'application/json');

  let body: ArrayBuffer | undefined;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    body = await request.arrayBuffer();
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body,
      redirect: 'manual',
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json(
      { error: 'BACKEND_UNREACHABLE', message: 'تعذر الاتصال بخدمة المنصة الخلفية.' },
      { status: 502 },
    );
  }

  const responseHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase()) && key.toLowerCase() !== 'set-cookie') {
      responseHeaders.set(key, value);
    }
  });
  for (const cookieLine of upstream.headers.getSetCookie()) {
    responseHeaders.append('set-cookie', cookieLine);
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export async function GET(request: NextRequest, context: BffContext) {
  return forward(request, context);
}

export async function POST(request: NextRequest, context: BffContext) {
  return forward(request, context);
}

export async function PUT(request: NextRequest, context: BffContext) {
  return forward(request, context);
}

export async function PATCH(request: NextRequest, context: BffContext) {
  return forward(request, context);
}

export async function DELETE(request: NextRequest, context: BffContext) {
  return forward(request, context);
}
