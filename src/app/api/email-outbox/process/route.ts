import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { sendDealEmail } from '@/lib/mailer';
import { mutationError } from '@/lib/security';

export async function POST(req: Request) {
  const invalid = mutationError(req);
  if (invalid) return invalid;
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const now = new Date();
  const logs = await db.emailLog.findMany({
    where: {
      status: 'FAILED',
      attempts: { lt: 3 },
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
      deal: { OR: [{ buyerId: user.id }, { providerId: user.id }] },
    },
    take: 10,
    orderBy: { updatedAt: 'asc' },
  });

  let attempted = 0;
  for (const log of logs) {
    const deal = await db.deal.findUnique({ where: { id: log.dealId } });
    if (!deal) continue;
    attempted += 1;
    await sendDealEmail({
      dealId: log.dealId,
      to: log.toEmail,
      type: log.type,
      title: `TrustFlow update · ${deal.title}`,
      message: 'A prior transaction notification is being retried.',
      key: log.idempotencyKey,
    });
  }

  return NextResponse.json({ processed: attempted });
}
