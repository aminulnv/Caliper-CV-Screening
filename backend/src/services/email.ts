import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sendSmtpMail } from './smtp-send.js';

const CALIPER_EMAIL_LOGO_CID = 'caliper-mark';

let configured: boolean | undefined;
let logoBytes: Buffer | undefined;

function smtpConfig() {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!host || !user || !pass || !from) return null;

  return {
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    user,
    pass,
    from,
    tlsInsecure: process.env.SMTP_TLS_INSECURE === '1' || process.env.SMTP_TLS_INSECURE === 'true',
  };
}

function caliperLogoBytes(): Buffer {
  if (!logoBytes) {
    const logoPath = join(dirname(fileURLToPath(import.meta.url)), '../../assets/caliper-mark.png');
    logoBytes = readFileSync(logoPath);
  }
  return logoBytes;
}

export function isEmailConfigured(): boolean {
  if (configured === undefined) configured = smtpConfig() != null;
  return configured;
}

export function appBaseUrl(): string {
  const raw = (process.env.APP_URL ?? process.env.CORS_ORIGIN ?? 'http://localhost:5173')
    .trim()
    .replace(/\/$/, '');
  // Only the apex resolves in DNS; the www. host is NXDOMAIN. Strip it so email links never 404.
  return raw.replace(/^(https?:\/\/)www\./i, '$1');
}

export async function sendEmail(options: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<boolean> {
  const cfg = smtpConfig();
  if (!cfg) {
    console.warn('[email] SMTP not configured — skipping send to', options.to);
    return false;
  }

  try {
    await sendSmtpMail({
      host: cfg.host,
      port: cfg.port,
      user: cfg.user,
      pass: cfg.pass,
      from: cfg.from,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
      inline: options.html
        ? [
            {
              cid: CALIPER_EMAIL_LOGO_CID,
              contentType: 'image/png',
              filename: 'caliper-mark.png',
              data: caliperLogoBytes(),
            },
          ]
        : undefined,
      tlsInsecure: cfg.tlsInsecure,
    });
    return true;
  } catch (err) {
    console.error('[email] Failed to send:', err instanceof Error ? err.message : err);
    return false;
  }
}
