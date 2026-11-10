import nodemailer, { type SendMailOptions } from 'nodemailer';

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
};

export type SmtpTransport = {
  sendMail(options: SendMailOptions): Promise<{ messageId?: string }>;
  close?: () => void;
};

export type SmtpTransportFactory = (config: SmtpConfig) => SmtpTransport;
export type SmtpEnvironment = Partial<Pick<NodeJS.ProcessEnv, 'SMTP_HOST' | 'SMTP_PORT' | 'SMTP_SECURE' | 'SMTP_USER' | 'SMTP_PASSWORD' | 'EMAIL_FROM'>>;

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
};

export type EmailSendResult =
  | { ok: true; messageId: string | null }
  | { ok: false; reason: string; retryable: boolean };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function readSmtpConfig(env: SmtpEnvironment): { config: SmtpConfig } | { error: string } {
  const host = env.SMTP_HOST?.trim();
  const port = Number(env.SMTP_PORT);
  const secureValue = env.SMTP_SECURE?.trim().toLowerCase();
  const user = env.SMTP_USER?.trim();
  const password = env.SMTP_PASSWORD?.replace(/\s/g, '');

  if (!host || !env.SMTP_PORT || !secureValue || !user || !password) {
    return { error: 'SMTP configuration required. Set SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, and SMTP_PASSWORD.' };
  }
  if (!/^[a-z0-9.-]+$/i.test(host)) return { error: 'SMTP_HOST must be a valid host name.' };
  if (!Number.isInteger(port) || port < 1 || port > 65535) return { error: 'SMTP_PORT must be a valid port number.' };
  if (secureValue !== 'true' && secureValue !== 'false') return { error: 'SMTP_SECURE must be either true or false.' };
  if (port === 587 && secureValue === 'true') {
    return { error: 'For SMTP_PORT 587, set SMTP_SECURE=false to use STARTTLS. Use port 465 with SMTP_SECURE=true for implicit TLS.' };
  }
  if (!EMAIL_PATTERN.test(user)) return { error: 'SMTP_USER must be the Gmail account address.' };

  // Gmail requires the From address to belong to the authenticated account;
  // SMTP_USER is therefore the safe default when no display name is configured.
  const configuredFrom = env.EMAIL_FROM?.trim() || user;
  const angleAddress = configuredFrom.match(/^([^<>]*)<([^<>]+)>$/);
  const simpleAddress = configuredFrom.match(/^([^\s@]+@[^\s@]+\.[^\s@]+)$/);
  const displayAndAddress = configuredFrom.match(/^(.+?)\s+([^\s@]+@[^\s@]+\.[^\s@]+)$/);
  const fromAddress = angleAddress?.[2].trim() || simpleAddress?.[1] || displayAndAddress?.[2];
  if (!fromAddress || !EMAIL_PATTERN.test(fromAddress) || /[\r\n]/.test(configuredFrom)) {
    return { error: 'EMAIL_FROM must be an email address or a display name followed by an email address.' };
  }
  const from = angleAddress
    ? `${angleAddress[1].trim()} <${fromAddress}>`
    : displayAndAddress
      ? `${displayAndAddress[1].trim()} <${fromAddress}>`
      : configuredFrom;

  return { config: { host, port, secure: secureValue === 'true', user, password, from } };
}

export function validateSmtpConfig(env: SmtpEnvironment = process.env as SmtpEnvironment): SmtpConfig | null {
  const result = readSmtpConfig(env);
  return 'config' in result ? result.config : null;
}

export function getSmtpConfigError(env: SmtpEnvironment = process.env as SmtpEnvironment): string | null {
  const result = readSmtpConfig(env);
  return 'error' in result ? result.error : null;
}

function createSmtpTransport(config: SmtpConfig): SmtpTransport {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    requireTLS: !config.secure,
    auth: { user: config.user, pass: config.password },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
}

function classifySmtpError(error: unknown): { reason: string; retryable: boolean } {
  const value = error && typeof error === 'object' ? (error as Record<string, unknown>) : {};
  const code = String(value.code ?? '').toUpperCase();
  const responseCode = Number(value.responseCode ?? 0);

  if (code === 'EAUTH' || responseCode === 534 || responseCode === 535) {
    return { reason: 'SMTP authentication failed. Check the Gmail address and App Password.', retryable: false };
  }
  if (code === 'EENVELOPE' || responseCode === 550 || responseCode === 551 || responseCode === 553) {
    return { reason: 'SMTP server rejected the recipient address.', retryable: false };
  }
  if (['ETIMEDOUT', 'ESOCKET', 'ECONNECTION', 'ECONNRESET', 'EHOSTUNREACH', 'EAI_AGAIN'].includes(code)) {
    return { reason: 'SMTP connection failed or timed out.', retryable: true };
  }
  if ((responseCode >= 400 && responseCode < 500) || [421, 450, 451, 452].includes(responseCode)) {
    return { reason: 'SMTP server is temporarily unavailable or rate limited.', retryable: true };
  }
  return { reason: 'SMTP delivery failed.', retryable: false };
}

export async function sendEmail(
  input: EmailMessage,
  options: {
    env?: SmtpEnvironment;
    transportFactory?: SmtpTransportFactory;
  } = {},
): Promise<EmailSendResult> {
  const configResult = readSmtpConfig(options.env ?? process.env as SmtpEnvironment);
  if (!('config' in configResult)) return { ok: false, reason: configResult.error, retryable: false };
  const config = configResult.config;
  if (!EMAIL_PATTERN.test(input.to.trim())) {
    return { ok: false, reason: 'SMTP server rejected the recipient address.', retryable: false };
  }

  let transport: SmtpTransport | undefined;
  try {
    transport = (options.transportFactory ?? createSmtpTransport)(config);
    const result = await transport.sendMail({
      from: config.from,
      to: input.to.trim(),
      subject: input.subject,
      html: input.html,
    });
    return { ok: true, messageId: result.messageId?.trim() || null };
  } catch (error) {
    return { ok: false, ...classifySmtpError(error) };
  } finally {
    transport?.close?.();
  }
}
