import { appBaseUrl } from './email.js';

const CALIPER_EMAIL_LOGO_CID = 'caliper-mark';

export function caliperEmailLogoSrc(): string {
  if (process.env.CALIPER_EMAIL_PREVIEW === '1') {
    return `${appBaseUrl()}/caliper-mark.png`;
  }
  return `cid:${CALIPER_EMAIL_LOGO_CID}`;
}

export type EmailVariant =
  | 'workspace_invite'
  | 'invite_accepted'
  | 'run_completed'
  | 'run_failed'
  | 'run_shared';

const BRAND = {
  purple: '#510eaa',
  purpleDark: '#200644',
  heroStart: '#0b1f4d',
  heroEnd: '#200644',
  bone: '#f7f6f3',
  surface: '#ffffff',
  ink: '#181614',
  inkSoft: '#4a4541',
  muted: '#736d66',
  subtle: '#a39e97',
  line: '#eaeaea',
  info: '#1f6c9f',
  infoSoft: '#e1f3fe',
  ok: '#346538',
  okSoft: '#edf3ec',
  bad: '#9f2f2d',
  badSoft: '#fdebec',
} as const;

const VARIANT_STYLE: Record<
  EmailVariant,
  { label: string; accent: string; chipBg: string; chipInk: string }
> = {
  workspace_invite: {
    label: 'WORKSPACE INVITE',
    accent: BRAND.purple,
    chipBg: '#f3eefb',
    chipInk: BRAND.purple,
  },
  invite_accepted: {
    label: 'INVITATION ACCEPTED',
    accent: BRAND.info,
    chipBg: BRAND.infoSoft,
    chipInk: BRAND.info,
  },
  run_completed: {
    label: 'RUN COMPLETE',
    accent: BRAND.ok,
    chipBg: BRAND.okSoft,
    chipInk: BRAND.ok,
  },
  run_failed: {
    label: 'RUN FAILED',
    accent: BRAND.bad,
    chipBg: BRAND.badSoft,
    chipInk: BRAND.bad,
  },
  run_shared: {
    label: 'RUN SHARED',
    accent: BRAND.info,
    chipBg: BRAND.infoSoft,
    chipInk: BRAND.info,
  },
};

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export type CaliperEmailInput = {
  variant: EmailVariant;
  preheader: string;
  headline: string;
  bodyHtml: string;
  meta?: { label: string; value: string }[];
  cta?: { label: string; href: string };
  footerNote?: string;
  plainText?: string;
};

function metaRows(meta: { label: string; value: string }[]): string {
  return meta
    .map(
      (row) => `
        <tr>
          <td style="padding:10px 14px;border-bottom:1px solid ${BRAND.line};font-family:ui-monospace,'SF Mono','JetBrains Mono',Menlo,monospace;font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:${BRAND.subtle};width:38%;vertical-align:top;">
            ${escapeHtml(row.label)}
          </td>
          <td style="padding:10px 14px;border-bottom:1px solid ${BRAND.line};font-family:Inter,system-ui,-apple-system,sans-serif;font-size:14px;line-height:1.45;color:${BRAND.ink};vertical-align:top;">
            ${escapeHtml(row.value)}
          </td>
        </tr>`,
    )
    .join('');
}

function ctaButton(label: string, href: string): string {
  const safeHref = escapeHtml(href);
  const safeLabel = escapeHtml(label);
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:28px 0 8px;">
      <tr>
        <td align="center" style="border-radius:8px;background:${BRAND.purple};" class="caliper-cta">
          <a href="${safeHref}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:Inter,system-ui,-apple-system,sans-serif;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;letter-spacing:-0.01em;">
            ${safeLabel}
          </a>
        </td>
      </tr>
    </table>`;
}

export function renderCaliperEmail(input: CaliperEmailInput): { html: string; text: string } {
  const logoSrc = caliperEmailLogoSrc();
  const style = VARIANT_STYLE[input.variant];
  const timestamp = new Date().toUTCString();

  const metaBlock =
    input.meta && input.meta.length > 0
      ? `
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0 0;border:1px solid ${BRAND.line};border-radius:10px;overflow:hidden;background:${BRAND.surface};">
          ${metaRows(input.meta)}
        </table>`
      : '';

  const ctaBlock = input.cta ? ctaButton(input.cta.label, input.cta.href) : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <meta http-equiv="X-UA-Compatible" content="IE=edge"/>
  <title>${escapeHtml(input.headline)}</title>
  <!--[if mso]>
  <style type="text/css">
    body, table, td { font-family: Arial, sans-serif !important; }
  </style>
  <![endif]-->
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    @keyframes caliperHeroDrift {
      0%, 100% { background-position: 0% 50%; }
      50% { background-position: 100% 50%; }
    }
    @keyframes caliperCtaPulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(81, 14, 170, 0); }
      50% { box-shadow: 0 0 0 6px rgba(81, 14, 170, 0.18); }
    }
    .caliper-hero {
      background: linear-gradient(135deg, ${BRAND.heroStart} 0%, ${BRAND.purpleDark} 55%, ${BRAND.heroEnd} 100%);
      background-size: 200% 200%;
      animation: caliperHeroDrift 12s ease-in-out infinite;
    }
    .caliper-cta {
      animation: caliperCtaPulse 3s ease-in-out infinite;
    }
    @media (prefers-reduced-motion: reduce) {
      .caliper-hero, .caliper-cta { animation: none !important; }
    }
    @media only screen and (max-width: 600px) {
      .caliper-shell { width: 100% !important; }
      .caliper-pad { padding-left: 20px !important; padding-right: 20px !important; }
      .caliper-headline { font-size: 24px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:${BRAND.bone};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">
    ${escapeHtml(input.preheader)}
  </div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${BRAND.bone};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" class="caliper-shell" width="600" cellspacing="0" cellpadding="0" border="0" style="width:600px;max-width:600px;background:${BRAND.surface};border:1px solid ${BRAND.line};border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(24,22,20,0.06);">
          <!-- Hero -->
          <tr>
            <td class="caliper-hero" style="padding:28px 32px;background:linear-gradient(135deg,${BRAND.heroStart} 0%,${BRAND.purpleDark} 55%,${BRAND.heroEnd} 100%);">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td width="44" valign="middle" style="padding-right:14px;">
                    <img src="${escapeHtml(logoSrc)}" width="40" height="40" alt="Caliper" style="display:block;border:0;border-radius:10px;"/>
                  </td>
                  <td valign="middle">
                    <div style="font-family:Inter,system-ui,-apple-system,sans-serif;font-size:22px;font-weight:700;letter-spacing:-0.03em;color:#ffffff;line-height:1.1;">
                      Caliper
                    </div>
                    <div style="font-family:ui-monospace,'SF Mono','JetBrains Mono',Menlo,monospace;font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:rgba(226,240,255,0.72);margin-top:6px;">
                      Neural Screening Engine
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Status rail -->
          <tr>
            <td style="padding:0;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td width="4" style="background:${style.accent};font-size:0;line-height:0;">&nbsp;</td>
                  <td class="caliper-pad" style="padding:18px 32px 0;">
                    <span style="display:inline-block;padding:5px 10px;border-radius:999px;background:${style.chipBg};color:${style.chipInk};font-family:ui-monospace,'SF Mono','JetBrains Mono',Menlo,monospace;font-size:10px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;">
                      ${escapeHtml(style.label)}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td class="caliper-pad" style="padding:20px 32px 32px;">
              <h1 class="caliper-headline" style="margin:0 0 16px;font-family:Inter,system-ui,-apple-system,sans-serif;font-size:28px;font-weight:700;letter-spacing:-0.03em;line-height:1.15;color:${BRAND.ink};">
                ${escapeHtml(input.headline)}
              </h1>
              <div style="font-family:Inter,system-ui,-apple-system,sans-serif;font-size:15px;line-height:1.6;color:${BRAND.inkSoft};">
                ${input.bodyHtml}
              </div>
              ${metaBlock}
              ${ctaBlock}
            </td>
          </tr>
          <!-- Telemetry footer -->
          <tr>
            <td style="padding:0 32px 24px;border-top:1px solid ${BRAND.line};">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="padding-top:18px;font-family:ui-monospace,'SF Mono','JetBrains Mono',Menlo,monospace;font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:${BRAND.subtle};line-height:1.6;">
                    CALIPER // ${escapeHtml(style.label)}<br/>
                    ${escapeHtml(timestamp)}
                  </td>
                </tr>
                ${
                  input.footerNote
                    ? `<tr><td style="padding-top:12px;font-family:Inter,system-ui,-apple-system,sans-serif;font-size:12px;line-height:1.5;color:${BRAND.muted};">${escapeHtml(input.footerNote)}</td></tr>`
                    : ''
                }
                <tr>
                  <td style="padding-top:14px;font-family:Inter,system-ui,-apple-system,sans-serif;font-size:11px;line-height:1.5;color:${BRAND.subtle};">
                    This is a transactional message from Caliper. AI-powered CV screening for your hiring team.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text =
    input.plainText ??
    [
      input.headline,
      '',
      stripHtml(input.bodyHtml),
      ...(input.meta?.map((m) => `${m.label}: ${m.value}`) ?? []),
      input.cta ? `\n${input.cta.label}: ${input.cta.href}` : '',
      input.footerNote ? `\n${input.footerNote}` : '',
    ]
      .filter(Boolean)
      .join('\n');

  return { html, text };
}

// ── Variant builders ─────────────────────────────────────────────────────────

export function renderWorkspaceInviteEmail(input: {
  inviteeEmail: string;
  workspaceName: string;
  role: string;
  inviterName: string | null;
  inviterEmail: string | null;
}): { html: string; text: string } {
  const base = appBaseUrl();
  const inviter = input.inviterName || input.inviterEmail || 'A Caliper admin';
  const bodyHtml = `<p style="margin:0 0 12px;">${escapeHtml(inviter)} invited you to join <strong style="color:${BRAND.ink};">${escapeHtml(input.workspaceName)}</strong> on Caliper as <strong style="color:${BRAND.ink};">${escapeHtml(input.role)}</strong>.</p><p style="margin:0;">Sign in with Google using <strong style="color:${BRAND.ink};">${escapeHtml(input.inviteeEmail)}</strong> to accept the invitation.</p>`;

  return renderCaliperEmail({
    variant: 'workspace_invite',
    preheader: `${inviter} invited you to ${input.workspaceName} on Caliper`,
    headline: `You're invited to ${input.workspaceName}`,
    bodyHtml,
    meta: [
      { label: 'Workspace', value: input.workspaceName },
      { label: 'Role', value: input.role },
      { label: 'Invited by', value: inviter },
    ],
    cta: { label: 'Sign in to Caliper', href: base },
    footerNote: 'Use the same email address shown above when signing in with Google.',
  });
}

export function renderInviteAcceptedEmail(input: {
  workspaceName: string;
  accepterEmail: string;
  accepterName: string | null;
}): { html: string; text: string } {
  const base = appBaseUrl();
  const who = input.accepterName || input.accepterEmail;
  const bodyHtml = `<p style="margin:0;">${escapeHtml(who)} accepted your invitation and joined <strong style="color:${BRAND.ink};">${escapeHtml(input.workspaceName)}</strong>. They now have access to the workspace.</p>`;

  return renderCaliperEmail({
    variant: 'invite_accepted',
    preheader: `${who} joined ${input.workspaceName} on Caliper`,
    headline: `${who} joined your workspace`,
    bodyHtml,
    meta: [
      { label: 'Member', value: who },
      { label: 'Email', value: input.accepterEmail },
      { label: 'Workspace', value: input.workspaceName },
    ],
    cta: { label: 'View team', href: `${base}/settings` },
  });
}

export function renderRunCompletedEmail(input: {
  jobName: string;
  runId: string;
  cvCount: number;
  scoreRange: [number, number] | null;
}): { html: string; text: string } {
  const base = appBaseUrl();
  const range =
    input.scoreRange != null
      ? `${input.scoreRange[0]}–${input.scoreRange[1]}`
      : 'n/a';
  const cvLabel = `${input.cvCount} CV${input.cvCount === 1 ? '' : 's'}`;
  const bodyHtml = `<p style="margin:0;">Screening finished for <strong style="color:${BRAND.ink};">${escapeHtml(input.jobName)}</strong>. ${escapeHtml(cvLabel)} scored — review ranked results and candidate breakdowns in Caliper.</p>`;

  return renderCaliperEmail({
    variant: 'run_completed',
    preheader: `${cvLabel} scored for ${input.jobName}. Score range: ${range}.`,
    headline: 'Screening complete',
    bodyHtml,
    meta: [
      { label: 'Job', value: input.jobName },
      { label: 'CVs scored', value: cvLabel },
      { label: 'Score range', value: range },
      { label: 'Run ID', value: input.runId },
    ],
    cta: { label: 'View results', href: `${base}/runs/${encodeURIComponent(input.runId)}` },
  });
}

export function renderRunSharedEmail(input: {
  jobName: string;
  runId: string;
  sharerName: string | null;
  sharerEmail: string | null;
}): { html: string; text: string } {
  const base = appBaseUrl();
  const sharer = input.sharerName || input.sharerEmail || 'A teammate';
  const bodyHtml = `<p style="margin:0;">${escapeHtml(sharer)} shared screening results for <strong style="color:${BRAND.ink};">${escapeHtml(input.jobName)}</strong> with you. Open the run in Caliper to review ranked candidates and scores.</p>`;

  return renderCaliperEmail({
    variant: 'run_shared',
    preheader: `${sharer} shared ${input.jobName} screening results with you`,
    headline: 'A screening run was shared with you',
    bodyHtml,
    meta: [
      { label: 'Job', value: input.jobName },
      { label: 'Shared by', value: sharer },
      { label: 'Run ID', value: input.runId },
    ],
    cta: { label: 'View run', href: `${base}/runs/${encodeURIComponent(input.runId)}` },
  });
}

export function renderRunFailedEmail(input: {
  jobName: string;
  runId: string;
  cvCount: number;
  errorMessage: string;
}): { html: string; text: string } {
  const base = appBaseUrl();
  const excerpt =
    input.errorMessage.length > 240
      ? `${input.errorMessage.slice(0, 237)}…`
      : input.errorMessage;
  const bodyHtml = `<p style="margin:0 0 12px;">Screening could not be completed for <strong style="color:${BRAND.ink};">${escapeHtml(input.jobName)}</strong>.</p><p style="margin:0;padding:12px 14px;border-radius:8px;background:${BRAND.badSoft};color:${BRAND.bad};font-size:14px;line-height:1.5;">${escapeHtml(excerpt)}</p>`;

  return renderCaliperEmail({
    variant: 'run_failed',
    preheader: `Screening failed for ${input.jobName}`,
    headline: 'Screening run failed',
    bodyHtml,
    meta: [
      { label: 'Job', value: input.jobName },
      { label: 'CVs attempted', value: String(input.cvCount) },
      { label: 'Run ID', value: input.runId },
    ],
    cta: { label: 'View run', href: `${base}/runs/${encodeURIComponent(input.runId)}` },
    footerNote: 'Check API keys in Settings and retry screening from the job page.',
  });
}
