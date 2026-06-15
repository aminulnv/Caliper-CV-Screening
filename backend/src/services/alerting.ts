import { sendEmail } from './email.js';
import {
  renderInviteAcceptedEmail,
  renderRunCompletedEmail,
  renderRunFailedEmail,
  renderRunSharedEmail,
  renderWorkspaceInviteEmail,
} from './email-templates.js';
import { createNotification, getUserEmail } from './notifications.js';

async function notifyUser(input: {
  workspaceId: string;
  userId: string;
  type: string;
  title: string;
  message?: string;
  linkPath?: string;
  email?: { subject: string; text: string; html: string };
}): Promise<void> {
  await createNotification({
    workspaceId: input.workspaceId,
    userId: input.userId,
    type: input.type,
    title: input.title,
    message: input.message ?? null,
    linkPath: input.linkPath ?? null,
  });

  if (!input.email) return;

  const to = await getUserEmail(input.userId);
  if (!to) return;

  await sendEmail({
    to,
    subject: input.email.subject,
    text: input.email.text,
    html: input.email.html,
  });
}

export async function alertWorkspaceInvite(input: {
  inviteeEmail: string;
  workspaceName: string;
  role: string;
  inviterName: string | null;
  inviterEmail: string | null;
}): Promise<void> {
  const { html, text } = renderWorkspaceInviteEmail(input);

  await sendEmail({
    to: input.inviteeEmail,
    subject: `You're invited to Caliper — ${input.workspaceName}`,
    text,
    html,
  });
}

export async function alertInviteAccepted(input: {
  workspaceId: string;
  inviterUserId: string;
  workspaceName: string;
  accepterEmail: string;
  accepterName: string | null;
}): Promise<void> {
  const who = input.accepterName || input.accepterEmail;
  const message = `${who} accepted your invitation to ${input.workspaceName}.`;
  const { html, text } = renderInviteAcceptedEmail(input);

  await notifyUser({
    workspaceId: input.workspaceId,
    userId: input.inviterUserId,
    type: 'workspace.invite_accepted',
    title: 'Invitation accepted',
    message,
    linkPath: '/settings',
    email: {
      subject: `${who} joined ${input.workspaceName} on Caliper`,
      text,
      html,
    },
  });
}

export async function alertRunCompleted(input: {
  workspaceId: string;
  ownerId: string;
  runId: string;
  jobName: string;
  cvCount: number;
  scoreRange: [number, number] | null;
}): Promise<void> {
  const range =
    input.scoreRange != null
      ? `${input.scoreRange[0]}–${input.scoreRange[1]}`
      : 'n/a';
  const message = `${input.cvCount} CV${input.cvCount === 1 ? '' : 's'} scored for ${input.jobName}. Score range: ${range}.`;
  const linkPath = `/runs/${input.runId}`;
  const { html, text } = renderRunCompletedEmail(input);

  await notifyUser({
    workspaceId: input.workspaceId,
    userId: input.ownerId,
    type: 'run.completed',
    title: 'Screening run finished',
    message,
    linkPath,
    email: {
      subject: `Screening complete — ${input.jobName}`,
      text,
      html,
    },
  });
}

export async function alertRunShared(input: {
  workspaceId: string;
  recipientUserId: string;
  runId: string;
  jobName: string;
  sharerName: string | null;
  sharerEmail: string | null;
}): Promise<void> {
  const sharer = input.sharerName || input.sharerEmail || 'A teammate';
  const message = `${sharer} shared screening results for ${input.jobName} with you.`;
  const linkPath = `/runs/${input.runId}`;
  const { html, text } = renderRunSharedEmail({
    jobName: input.jobName,
    runId: input.runId,
    sharerName: input.sharerName,
    sharerEmail: input.sharerEmail,
  });

  await notifyUser({
    workspaceId: input.workspaceId,
    userId: input.recipientUserId,
    type: 'run.shared',
    title: 'Screening run shared with you',
    message,
    linkPath,
    email: {
      subject: `${sharer} shared ${input.jobName} with you on Caliper`,
      text,
      html,
    },
  });
}

export async function alertRunFailed(input: {
  workspaceId: string;
  ownerId: string;
  runId: string;
  jobName: string;
  cvCount: number;
  errorMessage: string;
}): Promise<void> {
  const message = `Screening failed for ${input.jobName}: ${input.errorMessage}`;
  const linkPath = `/runs/${input.runId}`;
  const { html, text } = renderRunFailedEmail(input);

  await notifyUser({
    workspaceId: input.workspaceId,
    userId: input.ownerId,
    type: 'run.failed',
    title: 'Screening run failed',
    message,
    linkPath,
    email: {
      subject: `Screening failed — ${input.jobName}`,
      text,
      html,
    },
  });
}
