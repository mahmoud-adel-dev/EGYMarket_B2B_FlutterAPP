import mongoose from 'mongoose';
import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/db/mongoose';
import { assertProductionConfig } from '@/lib/config/env';

export async function GET() {
  try {
    // Fail fast on unsafe production configuration (weak/missing secrets).
    assertProductionConfig();
    await connectToDatabase();
    await mongoose.connection.db?.admin().ping();
    return NextResponse.json({ status: 'ready', database: 'connected', version: process.env.APP_VERSION || 'dev' });
  } catch {
    return NextResponse.json({ status: 'not_ready', database: 'unavailable' }, { status: 503 });
  }
}
