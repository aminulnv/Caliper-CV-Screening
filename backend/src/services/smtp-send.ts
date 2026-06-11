import net from 'node:net';
import tls from 'node:tls';

function encodeBase64(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64');
}

function readSmtpResponse(socket: net.Socket | tls.TLSSocket): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = '';

    const onData = (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split('\r\n').filter(Boolean);
      const last = lines[lines.length - 1] ?? '';
      if (/^\d{3} /.test(last)) {
        cleanup();
        resolve(buffer);
      }
    };
    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };
    const cleanup = () => {
      socket.off('data', onData);
      socket.off('error', onError);
    };
    socket.on('data', onData);
    socket.once('error', onError);
  });
}

async function expectCode(response: string, code: string): Promise<void> {
  const lastLine = response.split('\r\n').filter(Boolean).pop() ?? response;
  if (!lastLine.startsWith(code)) {
    throw new Error(`SMTP expected ${code}, got: ${lastLine.trim()}`);
  }
}

async function sendLine(socket: net.Socket | tls.TLSSocket, line: string): Promise<string> {
  socket.write(`${line}\r\n`);
  return readSmtpResponse(socket);
}

type InlineAttachment = {
  cid: string;
  contentType: string;
  filename: string;
  data: Buffer;
};

function wrapBase64(data: Buffer): string {
  const encoded = data.toString('base64');
  const lines: string[] = [];
  for (let i = 0; i < encoded.length; i += 76) {
    lines.push(encoded.slice(i, i + 76));
  }
  return lines.join('\r\n');
}

function buildAlternativePart(boundary: string, text: string, htmlBody: string): string {
  return [
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    text,
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    '',
    htmlBody,
    `--${boundary}--`,
  ].join('\r\n');
}

function buildMessage(
  from: string,
  to: string,
  subject: string,
  text: string,
  html?: string,
  inline?: InlineAttachment[],
): string {
  const htmlBody = html ?? text.replace(/\n/g, '<br/>');
  const headers = [`From: ${from}`, `To: ${to}`, `Subject: ${subject}`, 'MIME-Version: 1.0'];

  if (!inline?.length) {
    const boundary = `caliper-${Date.now()}`;
    return [
      ...headers,
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      '',
      buildAlternativePart(boundary, text, htmlBody),
      '',
    ].join('\r\n');
  }

  const relatedBoundary = `related-${Date.now()}`;
  const altBoundary = `alt-${Date.now()}`;
  const parts = [
    ...headers,
    `Content-Type: multipart/related; boundary="${relatedBoundary}"`,
    '',
    `--${relatedBoundary}`,
    `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
    '',
    buildAlternativePart(altBoundary, text, htmlBody),
  ];

  for (const attachment of inline) {
    parts.push(
      `--${relatedBoundary}`,
      `Content-Type: ${attachment.contentType}`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: inline; filename="${attachment.filename}"`,
      `Content-ID: <${attachment.cid}>`,
      '',
      wrapBase64(attachment.data),
    );
  }

  parts.push(`--${relatedBoundary}--`, '');
  return parts.join('\r\n');
}

export async function sendSmtpMail(options: {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
  inline?: InlineAttachment[];
  tlsInsecure?: boolean;
}): Promise<void> {
  const socket = net.connect(options.port, options.host);
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('error', reject);
  });

  try {
    let response = await readSmtpResponse(socket);
    await expectCode(response, '220');

    response = await sendLine(socket, 'EHLO caliper.local');
    await expectCode(response, '250');

    response = await sendLine(socket, 'STARTTLS');
    await expectCode(response, '220');

    const secureSocket = tls.connect({
      socket,
      servername: options.host,
      rejectUnauthorized: !options.tlsInsecure,
    });
    await new Promise<void>((resolve, reject) => {
      secureSocket.once('secureConnect', () => resolve());
      secureSocket.once('error', reject);
    });

    response = await sendLine(secureSocket, 'EHLO caliper.local');
    await expectCode(response, '250');

    response = await sendLine(secureSocket, 'AUTH LOGIN');
    await expectCode(response, '334');
    response = await sendLine(secureSocket, encodeBase64(options.user));
    await expectCode(response, '334');
    response = await sendLine(secureSocket, encodeBase64(options.pass));
    await expectCode(response, '235');

    response = await sendLine(secureSocket, `MAIL FROM:<${options.from}>`);
    await expectCode(response, '250');
    response = await sendLine(secureSocket, `RCPT TO:<${options.to}>`);
    await expectCode(response, '250');
    response = await sendLine(secureSocket, 'DATA');
    await expectCode(response, '354');

    const body = buildMessage(
      options.from,
      options.to,
      options.subject,
      options.text,
      options.html,
      options.inline,
    );
    secureSocket.write(`${body}\r\n.\r\n`);
    response = await readSmtpResponse(secureSocket);
    await expectCode(response, '250');

    await sendLine(secureSocket, 'QUIT');
    secureSocket.end();
  } catch (err) {
    socket.destroy();
    throw err;
  }
}
