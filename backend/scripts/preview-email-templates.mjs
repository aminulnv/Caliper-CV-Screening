#!/usr/bin/env node
/**
 * Writes sample Caliper HTML email previews to /tmp/caliper-email-previews/
 * Usage: node backend/scripts/preview-email-templates.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = '/tmp/caliper-email-previews';

process.env.APP_URL = process.env.APP_URL || 'http://localhost:5173';
process.env.CALIPER_EMAIL_PREVIEW = '1';

const { renderWorkspaceInviteEmail, renderInviteAcceptedEmail, renderRunCompletedEmail, renderRunFailedEmail } =
  await import('../dist/services/email-templates.js');

const samples = [
  {
    name: 'workspace-invite',
    render: () =>
      renderWorkspaceInviteEmail({
        inviteeEmail: 'alex@nextventures.io',
        workspaceName: 'Next Ventures',
        role: 'member',
        inviterName: 'Jordan Lee',
        inviterEmail: 'jordan@nextventures.io',
      }),
  },
  {
    name: 'invite-accepted',
    render: () =>
      renderInviteAcceptedEmail({
        workspaceName: 'Next Ventures',
        accepterEmail: 'alex@nextventures.io',
        accepterName: 'Alex Singh',
      }),
  },
  {
    name: 'run-completed',
    render: () =>
      renderRunCompletedEmail({
        jobName: 'Senior Product Manager',
        runId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        cvCount: 142,
        scoreRange: [62, 94],
      }),
  },
  {
    name: 'run-failed',
    render: () =>
      renderRunFailedEmail({
        jobName: 'Senior Product Manager',
        runId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        cvCount: 142,
        errorMessage:
          'OpenAI API rate limit exceeded after 3 retries. Check your API key quota in Settings and retry the run.',
      }),
  },
];

mkdirSync(outDir, { recursive: true });

const indexLinks = [];

for (const sample of samples) {
  const { html, text } = sample.render();
  const htmlPath = join(outDir, `${sample.name}.html`);
  const textPath = join(outDir, `${sample.name}.txt`);
  writeFileSync(htmlPath, html, 'utf8');
  writeFileSync(textPath, text, 'utf8');
  indexLinks.push(`<li><a href="${sample.name}.html">${sample.name}</a> · <a href="${sample.name}.txt">text</a></li>`);
  console.log(`Wrote ${htmlPath}`);
}

const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><title>Caliper email previews</title></head>
<body style="font-family:system-ui,sans-serif;padding:32px;">
  <h1>Caliper email previews</h1>
  <p>APP_URL: ${process.env.APP_URL}</p>
  <ul>${indexLinks.join('\n')}</ul>
</body>
</html>`;

writeFileSync(join(outDir, 'index.html'), indexHtml, 'utf8');
console.log(`\nOpen file://${outDir}/index.html in your browser.`);
