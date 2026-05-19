import pdfParse from 'pdf-parse';

const MAX_CHARS = 15_000; // cap to keep token usage sane

export interface ParsedCV {
  text: string;
  pageCount: number;
  warning: string | null;
}

export async function parsePdfBuffer(buffer: Buffer): Promise<ParsedCV> {
  let result: Awaited<ReturnType<typeof pdfParse>>;

  try {
    result = await pdfParse(buffer);
  } catch {
    return { text: '', pageCount: 0, warning: 'PDF could not be parsed' };
  }

  const rawText = result.text ?? '';
  const pageCount = result.numpages ?? 0;

  // Sanitize: strip null bytes and excessive whitespace
  const sanitized = rawText
    .replace(/\0/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const warning =
    sanitized.length < 100
      ? 'Very little text extracted — may be a scanned PDF'
      : sanitized.length > MAX_CHARS
        ? 'CV truncated to first 15,000 characters for scoring'
        : null;

  return {
    text: sanitized.slice(0, MAX_CHARS),
    pageCount,
    warning,
  };
}
