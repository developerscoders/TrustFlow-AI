import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getDatabaseUnavailableMessage, logDatabaseFailure } from '@/lib/database-errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  if (!process.env.DATABASE_URL?.trim()) {
    return NextResponse.json(
      {
        status: 'unavailable',
        database: 'not_configured',
        message: getDatabaseUnavailableMessage(),
      },
      { status: 503 },
    );
  }

  try {
    await db.$connect();
    return NextResponse.json({
      status: 'ok',
      database: 'connected',
    });
  } catch (error) {
    logDatabaseFailure('health:database', error);
    return NextResponse.json(
      {
        status: 'unavailable',
        database: 'disconnected',
        message: getDatabaseUnavailableMessage(error),
      },
      { status: 503 },
    );
  }
}
