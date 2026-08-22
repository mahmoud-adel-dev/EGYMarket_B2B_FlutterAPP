import { NextRequest, NextResponse } from 'next/server';

const corsHeaders = {
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Methods': 'GET,DELETE,OPTIONS,PATCH,POST,PUT',
  'Access-Control-Allow-Headers': 'X-CSRF-Token,X-Requested-With,Accept,Content-Type',
};

export function proxy(request: NextRequest) {
  const configuredOrigins = new Set(
    [
      process.env.APP_ORIGIN,
      ...(process.env.APP_ORIGINS || '').split(','),
    ]
      .map((origin) => origin?.trim())
      .filter((origin): origin is string => Boolean(origin)),
  );
  const requestOrigin = request.headers.get('origin') || '';
  const originAllowed = Boolean(requestOrigin && configuredOrigins.has(requestOrigin));
  const response = request.method === 'OPTIONS'
    ? new NextResponse(null, { status: 204 })
    : NextResponse.next();

  for (const [name, value] of Object.entries(corsHeaders)) {
    response.headers.set(name, value);
  }
  response.headers.set('Vary', 'Origin');
  if (originAllowed) response.headers.set('Access-Control-Allow-Origin', requestOrigin);
  return response;
}

export const config = {
  matcher: '/api/:path*',
};
