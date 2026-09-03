import { NextRequest, NextResponse } from 'next/server';
import { isCorsOriginAllowed } from '@/lib/http/cors';

const corsHeaders = {
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Methods': 'GET,DELETE,OPTIONS,PATCH,POST,PUT',
  'Access-Control-Allow-Headers': 'X-CSRF-Token,X-Requested-With,Accept,Authorization,Content-Type',
};

export function proxy(request: NextRequest) {
  const requestOrigin = request.headers.get('origin') || '';
  const originAllowed = isCorsOriginAllowed(requestOrigin, {
    nodeEnv: process.env.NODE_ENV,
    appOrigin: process.env.APP_ORIGIN,
    appOrigins: process.env.APP_ORIGINS,
  });
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
