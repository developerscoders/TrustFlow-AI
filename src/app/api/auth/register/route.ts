import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { createSession, hashPassword } from '@/lib/auth';
import { mutationError, rateLimit } from '@/lib/security';
import { getDatabaseUnavailableMessage, logDatabaseFailure } from '@/lib/database-errors';
import { linkPendingInvitations } from '@/lib/pending-invitations';

export const runtime = 'nodejs';

const input = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254),
  password: z.string().min(12).max(128),
});

export async function POST(req: Request) {
  const invalid = mutationError(req);
  if (invalid) return invalid;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const parsed = input.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Enter a valid name, email, and password of at least 12 characters.' },
      { status: 400 },
    );
  }

  const email = parsed.data.email.toLowerCase();
  if (!rateLimit(`auth:register:${email}`, 3, 60 * 60_000)) {
    return NextResponse.json(
      { error: 'Too many registration attempts. Try again later.' },
      { status: 429 },
    );
  }

  if (!process.env.DATABASE_URL?.trim()) {
    return NextResponse.json(
      { error: getDatabaseUnavailableMessage() },
      { status: 503 },
    );
  }

  try {
    const existingUser = await db.user.findUnique({ where: { email } });
    if (existingUser) {
      return NextResponse.json(
        { error: 'An account with this email already exists.' },
        { status: 409 },
      );
    }

    const user = await db.user.create({
      data: {
        name: parsed.data.name,
        email,
        passwordHash: await hashPassword(parsed.data.password),
      },
    });

    try {
      await linkPendingInvitations(user);
    } catch (error) {
      // Keep sign-in available if linking an older invitation needs to be retried.
      logDatabaseFailure('auth:register:pending-invitations', error);
    }

    await createSession(user.id);
    return NextResponse.json(
      { id: user.id, name: user.name, email: user.email },
      { status: 201 },
    );
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: string }).code === 'P2002'
    ) {
      return NextResponse.json(
        { error: 'An account with this email already exists.' },
        { status: 409 },
      );
    }

    logDatabaseFailure('auth:register', error);
    return NextResponse.json(
      { error: getDatabaseUnavailableMessage(error) },
      { status: 503 },
    );
  }
}
