import test from 'node:test';
import assert from 'node:assert/strict';
import { sendEmail, validateSmtpConfig, type SmtpConfig, type SmtpEnvironment, type SmtpTransport } from '../src/lib/email';

function smtpEnv(): SmtpEnvironment {
  return {
    SMTP_HOST: 'smtp.gmail.com',
    SMTP_PORT: '587',
    SMTP_SECURE: 'false',
    SMTP_USER: 'trustflow@gmail.com',
    SMTP_PASSWORD: 'abcd efgh ijkl mnop',
    EMAIL_FROM: 'TrustFlow AI <trustflow@gmail.com>',
  };
}

test('SMTP configuration validates required fields and normalizes Gmail App Password spaces', () => {
  const config = validateSmtpConfig(smtpEnv());
  assert.deepEqual(config, {
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    user: 'trustflow@gmail.com',
    password: 'abcdefghijklmnop',
    from: 'TrustFlow AI <trustflow@gmail.com>',
  });
  assert.equal(validateSmtpConfig({}), null);
  assert.equal(validateSmtpConfig({ ...smtpEnv(), SMTP_PORT: 'not-a-port' }), null);
  assert.equal(validateSmtpConfig({ ...smtpEnv(), SMTP_SECURE: 'sometimes' }), null);
  assert.equal(validateSmtpConfig({ ...smtpEnv(), SMTP_USER: 'not-an-email' }), null);
  assert.equal(validateSmtpConfig({ ...smtpEnv(), EMAIL_FROM: 'TrustFlow AI' }), null);
  const withoutSender = smtpEnv();
  delete withoutSender.EMAIL_FROM;
  assert.equal(validateSmtpConfig(withoutSender)?.from, 'trustflow@gmail.com');
  assert.equal(validateSmtpConfig({ ...smtpEnv(), EMAIL_FROM: 'TrustFlow AI trustflow@gmail.com' })?.from, 'TrustFlow AI <trustflow@gmail.com>');
  assert.equal(validateSmtpConfig({ ...smtpEnv(), SMTP_SECURE: 'true' }), null);
});

test('sendEmail submits a transactional message through an injected SMTP transport', async () => {
  const env = smtpEnv();
  let configSeen: SmtpConfig | undefined;
  let messageSeen: any;
  let closed = false;
  const transportFactory = (config: SmtpConfig): SmtpTransport => {
    configSeen = config;
    return {
      sendMail: async (message) => {
        messageSeen = message;
        return { messageId: '<accepted-123@gmail.com>' };
      },
      close: () => { closed = true; },
    };
  };

  const result = await sendEmail(
    { to: 'provider@example.com', subject: 'Deal invitation', html: '<p>Review this deal</p>' },
    { env, transportFactory },
  );

  assert.deepEqual(result, { ok: true, messageId: '<accepted-123@gmail.com>' });
  assert.equal(configSeen?.host, 'smtp.gmail.com');
  assert.equal(configSeen?.password, 'abcdefghijklmnop');
  assert.equal(messageSeen.from, 'TrustFlow AI <trustflow@gmail.com>');
  assert.equal(messageSeen.to, 'provider@example.com');
  assert.equal(messageSeen.subject, 'Deal invitation');
  assert.equal(closed, true);
});

test('missing SMTP configuration does not create a transport', async () => {
  let created = false;
  const result = await sendEmail(
    { to: 'provider@example.com', subject: 'Deal invitation', html: '<p>Hi</p>' },
    { env: {}, transportFactory: () => { created = true; return { sendMail: async () => ({}) }; } },
  );
  assert.deepEqual(result, {
    ok: false,
    reason: 'SMTP configuration required. Set SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, and SMTP_PASSWORD.',
    retryable: false,
  });
  assert.equal(created, false);
});

test('SMTP authentication failures are sanitized and permanent', async () => {
  const result = await sendEmail(
    { to: 'provider@example.com', subject: 'Deal invitation', html: '<p>Hi</p>' },
    {
      env: smtpEnv(),
      transportFactory: () => ({
        sendMail: async () => { throw Object.assign(new Error('EAUTH secret-password'), { code: 'EAUTH', responseCode: 535 }); },
      }),
    },
  );
  assert.deepEqual(result, {
    ok: false,
    reason: 'SMTP authentication failed. Check the Gmail address and App Password.',
    retryable: false,
  });
  assert.doesNotMatch(JSON.stringify(result), /secret-password/);
});

test('SMTP connection timeouts are transient and safe to retry', async () => {
  const result = await sendEmail(
    { to: 'provider@example.com', subject: 'Deal invitation', html: '<p>Hi</p>' },
    {
      env: smtpEnv(),
      transportFactory: () => ({
        sendMail: async () => { throw Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' }); },
      }),
    },
  );
  assert.deepEqual(result, { ok: false, reason: 'SMTP connection failed or timed out.', retryable: true });
});

test('SMTP rate limits are treated as temporary failures', async () => {
  const result = await sendEmail(
    { to: 'provider@example.com', subject: 'Deal invitation', html: '<p>Hi</p>' },
    {
      env: smtpEnv(),
      transportFactory: () => ({
        sendMail: async () => { throw Object.assign(new Error('too many messages'), { responseCode: 421 }); },
      }),
    },
  );
  assert.deepEqual(result, {
    ok: false,
    reason: 'SMTP server is temporarily unavailable or rate limited.',
    retryable: true,
  });
});

test('SMTP recipient rejections are permanent and do not expose server responses', async () => {
  const result = await sendEmail(
    { to: 'provider@example.com', subject: 'Deal invitation', html: '<p>Hi</p>' },
    {
      env: smtpEnv(),
      transportFactory: () => ({
        sendMail: async () => { throw Object.assign(new Error('private smtp response'), { code: 'EENVELOPE', responseCode: 550 }); },
      }),
    },
  );
  assert.deepEqual(result, { ok: false, reason: 'SMTP server rejected the recipient address.', retryable: false });
  assert.doesNotMatch(JSON.stringify(result), /private smtp response/);
});
