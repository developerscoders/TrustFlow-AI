import { db } from './db';
import { emailTemplate, type EmailTemplateType } from './email-templates';
import { getSmtpConfigError, sendEmail, type EmailSendResult } from './email';
import { retryDelay } from './security';
import { audit } from './events';

type EmailInput = {
  dealId: string;
  to: string;
  type: string;
  title: string;
  message: string;
  key: string;
  html?: string;
};

type EmailSender = (input: { to: string; subject: string; html: string }) => Promise<EmailSendResult>;

const acceptedStatuses = new Set(['SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'BOUNCED']);

export async function sendWorkflowEmail(input: {
  dealId: string;
  to: string;
  type: EmailTemplateType;
  dealTitle: string;
  message: string;
  key: string;
}) {
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  const view = await emailTemplate(
    input.type,
    input.dealTitle,
    input.message,
    `${base}/deals/${encodeURIComponent(input.dealId)}`,
  );
  return sendDealEmail({ ...input, title: view.subject, html: view.html });
}

export async function sendDealEmail(input: EmailInput, sender: EmailSender = sendEmail) {
  const to = input.to.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return { ok: false, status: 'FAILED', reason: 'Invalid recipient address.' } as const;
  }

  let log = await db.emailLog.findUnique({ where: { idempotencyKey: input.key } });
  if (log && acceptedStatuses.has(log.status)) {
    return { ok: true, status: log.status, duplicate: true } as const;
  }

  if (!log) {
    try {
      log = await db.emailLog.create({
        data: {
          dealId: input.dealId,
          toEmail: to,
          type: input.type,
          idempotencyKey: input.key,
          status: 'QUEUED',
          payload: JSON.stringify({ title: input.title, message: input.message, html: input.html || null }),
        },
      });
    } catch {
      log = await db.emailLog.findUnique({ where: { idempotencyKey: input.key } });
      if (!log) return { ok: false, status: 'FAILED', reason: 'Could not persist email attempt.' } as const;
      if (acceptedStatuses.has(log.status)) {
        return { ok: true, status: log.status, duplicate: true } as const;
      }
    }
  }

  if (log.toEmail.toLowerCase() !== to || log.dealId !== input.dealId || log.type !== input.type) {
    return { ok: false, status: 'FAILED', reason: 'Email idempotency key conflict.' } as const;
  }
  if (log.status === 'SENDING') {
    return { ok: false, status: 'SENDING', reason: 'Email send is already in progress.' } as const;
  }
  if (log.attempts >= 3) {
    return { ok: false, status: 'FAILED', reason: 'Email retry limit reached.' } as const;
  }

  let title = input.title;
  let message = input.message;
  let html = input.html;
  try {
    const saved = JSON.parse(log.payload || '{}') as { title?: string; message?: string; html?: string | null };
    if (saved.title) title = saved.title;
    if (saved.message) message = saved.message;
    if (saved.html) html = saved.html;
  } catch {
    // Continue with the supplied template if a legacy log has malformed payload data.
  }
  const body = html || fallbackHtml(title, message, input.dealId);

  const configError = getSmtpConfigError();
  if (configError) {
    await db.emailLog.update({
      where: { id: log.id },
      data: { status: 'FAILED', lastError: configError, nextAttemptAt: null },
    });
    return { ok: false, status: 'FAILED', reason: configError } as const;
  }

  const now = new Date();
  if (log.nextAttemptAt && log.nextAttemptAt > now) {
    return { ok: false, status: 'FAILED', reason: 'Email retry is not due yet.' } as const;
  }

  const claim = await db.emailLog.updateMany({
    where: {
      id: log.id,
      status: { in: ['QUEUED', 'FAILED'] },
      attempts: { lt: 3 },
      OR: [
        { nextAttemptAt: null },
        { nextAttemptAt: { isSet: false } },
        { nextAttemptAt: { lte: now } },
      ],
    },
    data: {
      status: 'SENDING',
      attempts: { increment: 1 },
      lastError: null,
      nextAttemptAt: null,
      sendingStartedAt: now,
    },
  });
  if (!claim.count) {
    const latest = await db.emailLog.findUnique({ where: { id: log.id } });
    if (latest && acceptedStatuses.has(latest.status)) {
      return { ok: true, status: latest.status, duplicate: true } as const;
    }
    return { ok: false, status: latest?.status || 'SENDING', reason: 'Email send is already in progress.' } as const;
  }

  const attempt = log.attempts + 1;
  const result = await sender({ to, subject: title, html: body });
  if (!result.ok) {
    const retryAt = result.retryable && attempt < 3 ? new Date(Date.now() + retryDelay(attempt)) : null;
    await db.emailLog.update({
      where: { id: log.id },
      data: {
        status: 'FAILED',
        lastError: result.reason,
        nextAttemptAt: retryAt,
      },
    });
    return { ok: false, status: 'FAILED', reason: result.reason } as const;
  }

  const sentAt = new Date();
  await db.emailLog.update({
    where: { id: log.id },
    data: {
      status: 'SENT',
      messageId: result.messageId,
      sentAt,
      lastError: null,
      nextAttemptAt: null,
    },
  });
  try {
    await audit(
      input.dealId,
      'EMAIL_SENT',
      'SMTP server accepted the email. Inbox delivery is not confirmed.',
      'Gmail SMTP',
      undefined,
      { type: 'EMAIL', id: log.id, metadata: { emailType: input.type, ...(result.messageId ? { messageId: result.messageId } : {}) } },
    );
  } catch {
    // An audit failure must not turn an accepted SMTP send into a reported failure.
  }
  return { ok: true, status: 'SENT', messageId: result.messageId } as const;
}

export const sendDealInvitation = (input: Omit<Parameters<typeof sendWorkflowEmail>[0], 'type'>) =>
  sendWorkflowEmail({ ...input, type: 'DEAL_INVITATION' });
export const sendAgreementApproved = (input: Omit<Parameters<typeof sendWorkflowEmail>[0], 'type'>) =>
  sendWorkflowEmail({ ...input, type: 'AGREEMENT_APPROVED' });
export const sendPaymentVerified = (input: Omit<Parameters<typeof sendWorkflowEmail>[0], 'type'>) =>
  sendWorkflowEmail({ ...input, type: 'PAYMENT_VERIFIED' });
export const sendEvidenceSubmitted = (input: Omit<Parameters<typeof sendWorkflowEmail>[0], 'type'>) =>
  sendWorkflowEmail({ ...input, type: 'EVIDENCE_SUBMITTED' });
export const sendAssessmentResult = (input: Omit<Parameters<typeof sendWorkflowEmail>[0], 'type'>) =>
  sendWorkflowEmail({ ...input, type: 'ASSESSMENT_RESULT' });
export const sendRevisionRequested = (input: Omit<Parameters<typeof sendWorkflowEmail>[0], 'type'>) =>
  sendWorkflowEmail({ ...input, type: 'REVISION_REQUESTED' });
export const sendDisputeOpened = (input: Omit<Parameters<typeof sendWorkflowEmail>[0], 'type'>) =>
  sendWorkflowEmail({ ...input, type: 'DISPUTE_OPENED' });

function fallbackHtml(title: string, message: string, dealId: string) {
  const escape = (value: string) =>
    value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] as string);
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  return `<main style="background:#FBF7F0;padding:32px;font:16px Arial;color:#1F2937"><section style="max-width:560px;margin:auto;background:#FFFDF8;padding:28px;border:1px solid #EADFCB;border-radius:16px"><h1 style="color:#2F5BEA">TrustFlow AI</h1><h2>${escape(title)}</h2><p>${escape(message)}</p><a href="${escape(base + '/deals/' + encodeURIComponent(dealId))}">Open deal</a></section></main>`;
}
