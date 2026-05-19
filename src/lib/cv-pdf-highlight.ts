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

  for (const item of items) {
    const str = item.str ?? '';
    if (!str) continue;
    if (raw.length > 0 && !/\s$/.test(raw) && !/^\s/.test(str)) {
      raw += ' ';
    }
    const start = raw.length;
    raw += str;
    spans.push({
      start,
      end: raw.length,
      rect: textItemRect(item, viewport),
    });
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

/** Match quote in raw PDF text (flexible whitespace, case-insensitive). */
export function findQuoteRangeInRaw(
  raw: string,
  quote: string,
): { start: number; end: number } | null {
  const trimmed = quote.trim();
  if (!trimmed || trimmed.length < 8) return null;

  const attempts = [
    trimmed,
    trimmed.slice(0, Math.min(trimmed.length, 120)),
    trimmed.slice(0, Math.min(trimmed.length, 64)),
  ].filter((q, i, arr) => q.length >= 12 && arr.indexOf(q) === i);

  for (const attempt of attempts) {
    const parts = attempt
      .split(/\s+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0)
      .map(escapeRegex);
    if (parts.length < 2) continue;

    const pattern = parts.join('\\s+');
    const re = new RegExp(pattern, 'i');
    const match = re.exec(raw);
    if (match?.index != null) {
      return { start: match.index, end: match.index + match[0].length };
    }
  }

  return null;
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

  return hits;
}
