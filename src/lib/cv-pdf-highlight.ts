import * as pdfjsLib from 'pdfjs-dist';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import type { PageViewport } from 'pdfjs-dist/types/src/display/display_utils';

export type PdfTextRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type PdfTextSpan = {
  start: number;
  end: number;
  rect: PdfTextRect;
};

export type PdfPageLayout = {
  pageIndex: number;
  cssWidth: number;
  displayHeight: number;
  rawText: string;
  spans: PdfTextSpan[];
};

function textItemRect(item: TextItem, viewport: PageViewport): PdfTextRect {
  const t = pdfjsLib.Util.transform(viewport.transform, item.transform);
  const fontHeight = Math.hypot(t[2], t[3]) || item.height * viewport.scale;
  return {
    left: t[4],
    top: t[5] - fontHeight,
    width: item.width * viewport.scale,
    height: fontHeight,
  };
}

function separatorBeforeItem(
  raw: string,
  prevRect: PdfTextRect | null,
  item: TextItem,
  viewport: PageViewport,
): string {
  if (!raw.length) return '';
  if (item.hasEOL) return '\n';

  const currRect = textItemRect(item, viewport);
  if (!prevRect) return ' ';

  const lineBreak = Math.abs(currRect.top - prevRect.top) > Math.max(prevRect.height, 4) * 0.45;
  if (lineBreak) return '\n';

  const gap = currRect.left - (prevRect.left + prevRect.width);
  if (gap > 1.5) return ' ';
  if (/\s$/.test(raw) || /^\s/.test(item.str ?? '')) return '';
  return '';
}

/** Build searchable text + span geometry for one PDF page at display scale. */
export function buildPageTextLayout(
  pageIndex: number,
  items: TextItem[],
  viewport: PageViewport,
  cssWidth: number,
  displayHeight: number,
): PdfPageLayout {
  const spans: PdfTextSpan[] = [];
  let raw = '';
  let prevRect: PdfTextRect | null = null;

  for (const item of items) {
    const str = item.str ?? '';
    if (!str) continue;

    raw += separatorBeforeItem(raw, prevRect, item, viewport);
    const start = raw.length;
    raw += str;
    const rect = textItemRect(item, viewport);
    spans.push({ start, end: raw.length, rect });
    prevRect = rect;
  }

  return {
    pageIndex,
    cssWidth,
    displayHeight,
    rawText: raw,
    spans,
  };
}

function rectsForRange(layout: PdfPageLayout, start: number, end: number): PdfTextRect[] {
  const rects: PdfTextRect[] = [];
  for (const span of layout.spans) {
    if (span.end <= start || span.start >= end) continue;
    rects.push(span.rect);
  }
  return rects;
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

type NormalizedSearch = {
  text: string;
  /** normalized index → raw index (inserted whitespace maps to nearest raw char) */
  toRaw: number[];
};

/** Collapse whitespace/punctuation differences while keeping a map back to raw indices. */
function normalizeForSearch(raw: string): NormalizedSearch {
  const toRaw: number[] = [];
  let text = '';
  let lastWasSpace = false;

  const pushSpace = (rawIndex: number) => {
    if (lastWasSpace) return;
    text += ' ';
    toRaw.push(Math.min(rawIndex, raw.length - 1));
    lastWasSpace = true;
  };

  for (let i = 0; i < raw.length; i += 1) {
    let ch = raw[i];
    if (ch === '\u00ad') continue; // soft hyphen

    ch = ch
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201c\u201d]/g, '"')
      .replace(/[\u2013\u2014]/g, '-');

    if (/\s/.test(ch)) {
      pushSpace(i);
      continue;
    }

    if (/[^\p{L}\p{N}']/u.test(ch)) {
      pushSpace(i);
      continue;
    }

    text += ch.toLowerCase();
    toRaw.push(i);
    lastWasSpace = false;
  }

  return { text: text.trim(), toRaw };
}

function tokenize(text: string): string[] {
  return text
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/** Quote must go through the same char normalization as the haystack or tokens never match. */
function normalizeQuoteText(quote: string): string {
  return normalizeForSearch(quote.normalize('NFKC')).text;
}

function mapNormalizedRangeToRaw(
  norm: NormalizedSearch,
  start: number,
  end: number,
): { start: number; end: number } | null {
  if (start < 0 || end <= start || start >= norm.toRaw.length) return null;
  const rawStart = norm.toRaw[start] ?? 0;
  const rawEnd = (norm.toRaw[Math.min(end - 1, norm.toRaw.length - 1)] ?? rawStart) + 1;
  return { start: rawStart, end: Math.max(rawEnd, rawStart + 1) };
}

/** Like normalizeForSearch but drops ALL separators — finds words split mid-token
 *  by the PDF text layer (e.g. "Banglades" + "h" on the next line). */
function squashForSearch(raw: string): NormalizedSearch {
  const toRaw: number[] = [];
  let text = '';

  for (let i = 0; i < raw.length; i += 1) {
    let ch = raw[i];
    if (ch === '\u00ad') continue;
    ch = ch
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201c\u201d]/g, '"')
      .replace(/[\u2013\u2014]/g, '-');
    if (/[^\p{L}\p{N}]/u.test(ch)) continue;
    text += ch.toLowerCase();
    toRaw.push(i);
  }

  return { text, toRaw };
}

function findSquashedRange(raw: string, quote: string): { start: number; end: number } | null {
  const haystack = squashForSearch(raw);
  const needle = squashForSearch(quote.normalize('NFKC')).text;
  if (needle.length < 10 || !haystack.text) return null;

  const hit = haystack.text.indexOf(needle);
  if (hit === -1) return null;
  return mapNormalizedRangeToRaw(haystack, hit, hit + needle.length);
}

/** Flexible regex on normalized text (whitespace between tokens). */
function findRegexRange(norm: NormalizedSearch, quote: string): { start: number; end: number } | null {
  const attempts = [
    quote.trim(),
    quote.trim().slice(0, Math.min(quote.length, 160)),
    quote.trim().slice(0, Math.min(quote.length, 96)),
    quote.trim().slice(0, Math.min(quote.length, 48)),
  ].filter((q, i, arr) => q.length >= 8 && arr.indexOf(q) === i);

  for (const attempt of attempts) {
    const parts = tokenize(normalizeQuoteText(attempt)).map(escapeRegex);
    if (!parts.length) continue;

    const pattern = parts.join('\\s+');
    const re = new RegExp(pattern, 'i');
    const match = re.exec(norm.text);
    if (match?.index != null) {
      return mapNormalizedRangeToRaw(norm, match.index, match.index + match[0].length);
    }
  }

  return null;
}

/**
 * Match quote tokens in order with gaps (handles PDF line breaks / reordering).
 * Requires ~60% of tokens or at least 3 consecutive matches.
 */
function findTokenSequenceRange(
  norm: NormalizedSearch,
  quote: string,
): { start: number; end: number } | null {
  const quoteTokens = tokenize(normalizeQuoteText(quote))
    .filter((t) => t.length >= 2);
  if (quoteTokens.length < 2) return null;

  const minNeeded = Math.min(
    quoteTokens.length,
    Math.max(2, Math.ceil(quoteTokens.length * 0.55)),
  );
  let best: { start: number; end: number; matched: number } | null = null;

  for (let startTok = 0; startTok < Math.min(quoteTokens.length, 4); startTok += 1) {
    const seed = quoteTokens[startTok];
    let searchFrom = 0;

    while (searchFrom < norm.text.length) {
      const hit = norm.text.indexOf(seed, searchFrom);
      if (hit === -1) break;

      let normEnd = hit + seed.length;
      let matched = 1;
      let cursor = normEnd;

      for (let t = startTok + 1; t < quoteTokens.length; t += 1) {
        const token = quoteTokens[t];
        const windowEnd = Math.min(norm.text.length, cursor + 120);
        const slice = norm.text.slice(cursor, windowEnd);
        const rel = slice.indexOf(token);
        if (rel === -1) break;
        cursor = cursor + rel + token.length;
        normEnd = cursor;
        matched += 1;
      }

      if (matched >= minNeeded && (!best || matched > best.matched)) {
        const mapped = mapNormalizedRangeToRaw(norm, hit, normEnd);
        if (mapped) best = { ...mapped, matched };
      }

      searchFrom = hit + 1;
    }
  }

  return best ? { start: best.start, end: best.end } : null;
}

/** Match quote in raw PDF text (flexible whitespace, case-insensitive, token fallback). */
export function findQuoteRangeInRaw(
  raw: string,
  quote: string,
): { start: number; end: number } | null {
  const trimmed = quote.trim();
  if (!trimmed || trimmed.length < 6) return null;

  const norm = normalizeForSearch(raw);
  if (!norm.text) return null;

  return (
    findRegexRange(norm, trimmed)
    ?? findSquashedRange(raw, trimmed)
    ?? findTokenSequenceRange(norm, trimmed)
  );
}

/** Merge adjacent boxes on the same line into smooth highlight bands. */
export function mergeHighlightRects(rects: PdfTextRect[], pad = 4): PdfTextRect[] {
  if (!rects.length) return [];

  const sorted = [...rects].sort((a, b) => a.top - b.top || a.left - b.left);
  const lineTol = 8;
  const merged: Array<{ left: number; top: number; right: number; bottom: number }> = [];

  for (const r of sorted) {
    const right = r.left + r.width;
    const bottom = r.top + r.height;
    const line = merged.find((m) => Math.abs(m.top - r.top) <= lineTol);
    if (line) {
      line.left = Math.min(line.left, r.left);
      line.top = Math.min(line.top, r.top);
      line.right = Math.max(line.right, right);
      line.bottom = Math.max(line.bottom, bottom);
    } else {
      merged.push({ left: r.left, top: r.top, right, bottom });
    }
  }

  return merged.map((m) => ({
    left: Math.max(0, m.left - pad),
    top: Math.max(0, m.top - 2),
    width: m.right - m.left + pad * 2,
    height: m.bottom - m.top + 4,
  }));
}

/** Locate quote on PDF pages; returns merged bands per page. */
export function findQuoteHighlights(
  layouts: PdfPageLayout[],
  quote: string,
): { pageIndex: number; rects: PdfTextRect[] }[] {
  const hits: { pageIndex: number; rects: PdfTextRect[] }[] = [];

  for (const layout of layouts) {
    const range = findQuoteRangeInRaw(layout.rawText, quote);
    if (!range) continue;

    const rects = mergeHighlightRects(rectsForRange(layout, range.start, range.end));
    if (rects.length) hits.push({ pageIndex: layout.pageIndex, rects });
  }

  if (hits.length) return hits;

  // Fallback: AI quotes are sometimes stitched ("foo... bar") or wrap verbatim CV
  // text in quotes. Try the fragments individually, longest first.
  for (const fragment of quoteFragments(quote)) {
    for (const layout of layouts) {
      const range = findQuoteRangeInRaw(layout.rawText, fragment);
      if (!range) continue;
      const rects = mergeHighlightRects(rectsForRange(layout, range.start, range.end));
      if (rects.length) hits.push({ pageIndex: layout.pageIndex, rects });
    }
    if (hits.length) return hits;
  }

  return hits;
}

/** Candidate sub-phrases worth searching when the full quote fails. */
function quoteFragments(quote: string): string[] {
  const trimmed = quote.trim();
  const fragments = new Set<string>();

  // Text inside single/double quotes is usually verbatim CV text.
  for (const m of trimmed.matchAll(/['"\u2018\u201c]([^'"\u2019\u201d]{8,})['"\u2019\u201d]/g)) {
    fragments.add(m[1].trim());
  }

  // Ellipsis-stitched quotes: each side may exist verbatim.
  for (const part of trimmed.split(/(?:\.{3}|\u2026)/)) {
    const p = part.trim();
    if (p.length >= 12) fragments.add(p);
  }

  // Sentences within the quote.
  for (const part of trimmed.split(/(?<=[.!?])\s+/)) {
    const p = part.trim();
    if (p.length >= 24 && p !== trimmed) fragments.add(p);
  }

  return [...fragments].sort((a, b) => b.length - a.length);
}
