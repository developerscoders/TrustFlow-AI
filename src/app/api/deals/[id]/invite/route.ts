import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { sendWorkflowEmail } from '@/lib/mailer';
import { mutationError } from '@/lib/security';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const invalid = mutationError(req);
  if (invalid) return invalid;
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const deal = await db.deal.findFirst({
    where: { id, buyerId: user.id },
    select: { id: true, title: true, providerId: true, providerEmail: true },
  });
  if (!deal) return NextResponse.json({ error: 'Deal not found.' }, { status: 404 });
  if (!deal.providerEmail) return NextResponse.json({ error: 'This deal has no provider email to invite.' }, { status: 409 });

  if (deal.providerId) {
    const notice = await db.notification.findFirst({
      where: { userId: deal.providerId, dealId: deal.id, type: 'AGREEMENT' },
      select: { id: true },
    });
    if (!notice) {
      await db.notification.create({
        data: {
          userId: deal.providerId,
          dealId: deal.id,
          title: 'Agreement approval required',
          message: `Review and approve the current agreement for ${deal.title}.`,
          type: 'AGREEMENT',
        },
      });
    }
  }

  const queuedInvite = await db.emailLog.findFirst({
    where: {
      dealId: deal.id,
      toEmail: deal.providerEmail.toLowerCase(),
      type: 'DEAL_INVITATION',
      status: 'QUEUED',
    },
    orderBy: { createdAt: 'desc' },
    select: { idempotencyKey: true },
  });

  const result = await sendWorkflowEmail({
    dealId: deal.id,
    to: deal.providerEmail,
    type: 'DEAL_INVITATION',
    dealTitle: deal.title,
    message: deal.providerId
      ? `${user.name} asked you to review and approve the current agreement.`
      : `${user.name} invited you to TrustFlow. Create an account using this email address to open and approve the deal.`,
    key: queuedInvite?.idempotencyKey ?? `invite-${deal.id}-${deal.providerEmail.toLowerCase()}-${Math.floor(Date.now() / 60_000)}`,
  });
  if (!result.ok) {
    const missingConfig = result.reason.startsWith('SMTP configuration required.');
    const error = missingConfig
      ? 'Gmail SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, and SMTP_PASSWORD. EMAIL_FROM is optional and defaults to SMTP_USER.'
      : result.reason;
    const retryable = /temporarily|timed out|connection|rate limit|already in progress/i.test(result.reason);
    return NextResponse.json({ error }, { status: retryable || missingConfig ? 503 : 502 });
  }
  return NextResponse.json({ ok: true, message: 'Invitation submitted to the configured email service.' });
}
