import test from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../src/lib/db';
import { sendDealEmail } from '../src/lib/mailer';
import type { EmailSendResult, SmtpEnvironment } from '../src/lib/email';

const input = {
  dealId: 'deal-1',
  to: 'buyer@example.com',
  type: 'PAYMENT_VERIFIED',
  title: 'Payment verified',
  message: 'PayPal confirmed the payment.',
  html: '<p>Payment verified</p>',
  key: 'payment-deal-1',
};

function mockEmailDb(existing: any = null) {
  const state = { record: existing, updates: [] as any[] };
  const emailLog = {
    findUnique: async ({ where }: any) => {
      if (!state.record) return null;
      if (where?.id && where.id !== state.record.id) return null;
      if (where?.idempotencyKey && where.idempotencyKey !== state.record.idempotencyKey) return null;
      return state.record;
    },
    create: async ({ data }: any) => {
      state.record = { id: 'email-log-1', attempts: 0, ...data };
      return state.record;
    },
    updateMany: async ({ where, data }: any) => {
      assert.ok(where.OR?.some((condition: any) => condition.nextAttemptAt?.isSet === false));
      const due = !state.record?.nextAttemptAt || state.record.nextAttemptAt <= new Date();
      if (
        !state.record ||
        state.record.id !== where.id ||
        !where.status.in.includes(state.record.status) ||
        state.record.attempts >= where.attempts.lt ||
        !due
      ) return { count: 0 };
      state.record = {
        ...state.record,
        ...data,
        attempts: state.record.attempts + data.attempts.increment,
      };
      return { count: 1 };
    },
    update: async ({ data }: any) => {
      state.updates.push(data);
      state.record = { ...state.record, ...data };
      return state.record;
    },
  };
  Object.defineProperty(db, 'emailLog', { configurable: true, value: emailLog });
  Object.defineProperty(db, 'activity', { configurable: true, value: { create: async () => ({ id: 'activity-1' }) } });
  return {
    state,
    restore() {
      delete (db as any).emailLog;
      delete (db as any).activity;
    },
  };
}

function smtpEnv() {
  return {
    SMTP_HOST: 'smtp.gmail.com',
    SMTP_PORT: '587',
    SMTP_SECURE: 'false',
    SMTP_USER: 'trustflow@gmail.com',
    SMTP_PASSWORD: 'abcd efgh ijkl mnop',
    EMAIL_FROM: 'TrustFlow AI <trustflow@gmail.com>',
  } as SmtpEnvironment;
}

function setSmtpEnv(env: SmtpEnvironment) {
  const keys = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASSWORD', 'EMAIL_FROM'] as const;
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  for (const key of keys) {
    if (env[key] === undefined) delete process.env[key];
    else process.env[key] = env[key];
  }
  return () => {
    for (const key of keys) {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
}

test('SMTP-accepted email updates the log with message ID and sent time', async () => {
  const mock = mockEmailDb();
  const restoreEnv = setSmtpEnv(smtpEnv());
  let calls = 0;
  const sender = async (): Promise<EmailSendResult> => {
    calls += 1;
    return { ok: true, messageId: '<smtp-message-1@gmail.com>' };
  };
  try {
    const result = await sendDealEmail(input, sender);
    assert.equal(result.ok, true);
    assert.equal(result.status, 'SENT');
    assert.equal(calls, 1);
    assert.equal(mock.state.record.status, 'SENT');
    assert.equal(mock.state.record.messageId, '<smtp-message-1@gmail.com>');
    assert.ok(mock.state.record.sentAt instanceof Date);
    assert.equal(mock.state.record.attempts, 1);
  } finally {
    restoreEnv();
    mock.restore();
  }
});

test('missing SMTP configuration is recorded without attempting a send', async () => {
  const mock = mockEmailDb();
  const restoreEnv = setSmtpEnv({});
  let calls = 0;
  try {
    const result = await sendDealEmail(input, async () => {
      calls += 1;
      return { ok: true, messageId: 'unexpected' };
    });
    assert.equal(result.ok, false);
    assert.match(result.reason, /SMTP configuration required/);
    assert.equal(calls, 0);
    assert.equal(mock.state.record.status, 'FAILED');
    assert.match(mock.state.record.lastError, /SMTP configuration required/);
    assert.equal(mock.state.record.attempts, 0);
  } finally {
    restoreEnv();
    mock.restore();
  }
});

test('SMTP authentication failure is sanitized and not automatically retried', async () => {
  const mock = mockEmailDb();
  const restoreEnv = setSmtpEnv(smtpEnv());
  try {
    const result = await sendDealEmail(input, async () => ({
      ok: false,
      reason: 'SMTP authentication failed. Check the Gmail address and App Password.',
      retryable: false,
    }));
    assert.equal(result.ok, false);
    assert.equal(mock.state.record.status, 'FAILED');
    assert.equal(mock.state.record.nextAttemptAt, null);
    assert.equal(mock.state.record.lastError, 'SMTP authentication failed. Check the Gmail address and App Password.');
  } finally {
    restoreEnv();
    mock.restore();
  }
});

test('temporary SMTP connection failures receive an exponential retry time', async () => {
  const mock = mockEmailDb();
  const restoreEnv = setSmtpEnv(smtpEnv());
  try {
    const result = await sendDealEmail(input, async () => ({
      ok: false,
      reason: 'SMTP connection failed or timed out.',
      retryable: true,
    }));
    assert.equal(result.ok, false);
    assert.equal(mock.state.record.status, 'FAILED');
    assert.ok(mock.state.record.nextAttemptAt instanceof Date);
    assert.equal(mock.state.record.lastError, 'SMTP connection failed or timed out.');
  } finally {
    restoreEnv();
    mock.restore();
  }
});

test('idempotency prevents a second SMTP send after acceptance', async () => {
  const mock = mockEmailDb({
    id: 'email-log-1',
    dealId: input.dealId,
    toEmail: input.to,
    type: input.type,
    idempotencyKey: input.key,
    status: 'SENT',
    attempts: 1,
  });
  const restoreEnv = setSmtpEnv(smtpEnv());
  let calls = 0;
  try {
    const result = await sendDealEmail(input, async () => {
      calls += 1;
      return { ok: true, messageId: 'duplicate' };
    });
    assert.equal(result.ok, true);
    assert.equal(result.duplicate, true);
    assert.equal(calls, 0);
  } finally {
    restoreEnv();
    mock.restore();
  }
});

test('a concurrent SENDING record is not submitted twice', async () => {
  const mock = mockEmailDb({
    id: 'email-log-1',
    dealId: input.dealId,
    toEmail: input.to,
    type: input.type,
    idempotencyKey: input.key,
    status: 'SENDING',
    attempts: 1,
  });
  const restoreEnv = setSmtpEnv(smtpEnv());
  let calls = 0;
  try {
    const result = await sendDealEmail(input, async () => {
      calls += 1;
      return { ok: true, messageId: 'duplicate' };
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, 'SENDING');
    assert.equal(calls, 0);
  } finally {
    restoreEnv();
    mock.restore();
  }
});
