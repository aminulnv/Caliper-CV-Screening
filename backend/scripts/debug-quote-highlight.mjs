// Debug: test quote→PDF matching with the same pdf.js extraction the frontend uses.
// Usage: node scripts/debug-quote-highlight.mjs
import 'dotenv/config';
import postgres from 'postgres';
import * as pdfjsLib from '../../node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import { resolveDatabaseUrl } from '../dist/config/database-url.js';

const url = resolveDatabaseUrl();
const sql = postgres(url, {
  ssl: url.includes('rds.amazonaws.com') ? { rejectUnauthorized: false } : false,
  transform: postgres.camel,
});

// Same storage client the backend uses
const { storage } = await import('../dist/services/storage.js');

// ── Copy of frontend layout/matching logic (kept in sync manually) ──────────
function separatorBeforeItem(raw, prevRect, item, rect) {
  if (!raw.length) return '';
  if (item.hasEOL) return '\n';
  if (!prevRect) return ' ';
  const lineBreak = Math.abs(rect.top - prevRect.top) > Math.max(prevRect.height, 4) * 0.45;
  if (lineBreak) return '\n';
  const gap = rect.left - (prevRect.left + prevRect.width);
  if (gap > 1.5) return ' ';
  return '';
}

function buildRawText(items, viewport) {
  let raw = '';
  let prevRect = null;
  for (const item of items) {
    const str = item.str ?? '';
    if (!str) continue;
    const t = pdfjsLib.Util.transform(viewport.transform, item.transform);
    const fontHeight = Math.hypot(t[2], t[3]) || (item.height ?? 10);
    const rect = { left: t[4], top: t[5] - fontHeight, width: item.width, height: fontHeight };
    raw += separatorBeforeItem(raw, prevRect, item, rect);
    raw += str;
    prevRect = rect;
  }
  return raw;
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeForSearch(raw) {
  const toRaw = [];
  let text = '';
  let lastWasSpace = false;
  const pushSpace = (rawIndex) => {
    if (lastWasSpace) return;
    text += ' ';
    toRaw.push(Math.min(rawIndex, raw.length - 1));
    lastWasSpace = true;
  };
  for (let i = 0; i < raw.length; i += 1) {
    let ch = raw[i];
    if (ch === '\u00ad') continue;
    ch = ch
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201c\u201d]/g, '"')
      .replace(/[\u2013\u2014]/g, '-');
    if (/\s/.test(ch)) { pushSpace(i); continue; }
    if (/[^\p{L}\p{N}']/u.test(ch)) { pushSpace(i); continue; }
    text += ch.toLowerCase();
    toRaw.push(i);
    lastWasSpace = false;
  }
  return { text: text.trim(), toRaw };
}

function tokenize(text) {
  return text.split(/\s+/).map((t) => t.trim()).filter((t) => t.length > 0);
}

function normalizeQuoteText(quote) {
  return normalizeForSearch(quote.normalize('NFKC')).text;
}

function squashForSearch(raw) {
  const toRaw = [];
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

function findSquashedRange(raw, quote) {
  const haystack = squashForSearch(raw);
  const needle = squashForSearch(quote.normalize('NFKC')).text;
  if (needle.length < 10 || !haystack.text) return null;
  const hit = haystack.text.indexOf(needle);
  if (hit === -1) return null;
  return { start: hit, end: hit + needle.length, via: 'squash' };
}

function findRegexRange(norm, quote) {
  const attempts = [
    quote.trim(),
    quote.trim().slice(0, Math.min(quote.length, 160)),
    quote.trim().slice(0, Math.min(quote.length, 96)),
    quote.trim().slice(0, Math.min(quote.length, 48)),
  ].filter((q, i, arr) => q.length >= 8 && arr.indexOf(q) === i);
  for (const attempt of attempts) {
    const parts = tokenize(normalizeQuoteText(attempt)).map(escapeRegex);
    if (!parts.length) continue;
    const re = new RegExp(parts.join('\\s+'), 'i');
    const match = re.exec(norm.text);
    if (match?.index != null) return { start: match.index, end: match.index + match[0].length, via: 'regex' };
  }
  return null;
}

function findTokenSequenceRange(norm, quote) {
  const quoteTokens = tokenize(normalizeQuoteText(quote)).filter((t) => t.length >= 2);
  if (quoteTokens.length < 2) return null;
  const minNeeded = Math.min(quoteTokens.length, Math.max(2, Math.ceil(quoteTokens.length * 0.55)));
  let best = null;
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
        const rel = norm.text.slice(cursor, windowEnd).indexOf(token);
        if (rel === -1) break;
        cursor = cursor + rel + token.length;
        normEnd = cursor;
        matched += 1;
      }
      if (matched >= minNeeded && (!best || matched > best.matched)) {
        best = { start: hit, end: normEnd, matched, total: quoteTokens.length, via: 'tokens' };
      }
      searchFrom = hit + 1;
    }
  }
  return best;
}

function findQuote(norm, quote, raw) {
  const trimmed = quote.trim();
  if (!trimmed || trimmed.length < 6) return null;
  return (
    findRegexRange(norm, trimmed)
    ?? findSquashedRange(raw, trimmed)
    ?? findTokenSequenceRange(norm, trimmed)
  );
}

// ── Run the test ─────────────────────────────────────────────────────────────
const candidates = await sql`
  SELECT rc.id, rc.name, rc.cv_storage_path
  FROM run_candidates rc
  WHERE rc.cv_storage_path IS NOT NULL
    AND EXISTS (SELECT 1 FROM candidate_evaluations ce WHERE ce.candidate_id = rc.id AND ce.quote IS NOT NULL)
  ORDER BY rc.created_at DESC
  LIMIT 40
`;

let totalQuotes = 0;
let matched = 0;
const failures = [];

for (const cand of candidates) {
  const evals = await sql`
    SELECT ce.quote, jc.name AS criterion
    FROM candidate_evaluations ce
    JOIN job_criteria jc ON jc.id = ce.criterion_id
    WHERE ce.candidate_id = ${cand.id} AND ce.quote IS NOT NULL AND length(trim(ce.quote)) > 0
  `;
  if (!evals.length) continue;

  let buffer;
  try {
    buffer = await storage.download(cand.cvStoragePath);
  } catch (e) {
    console.log(`SKIP ${cand.name}: download failed: ${e.message}`);
    continue;
  }

  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  const pageTexts = [];
  for (let p = 1; p <= pdf.numPages; p += 1) {
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    pageTexts.push(buildRawText(tc.items, viewport));
  }
  const norms = pageTexts.map(normalizeForSearch);

  for (const ev of evals) {
    totalQuotes += 1;
    let hit = null;
    for (let n = 0; n < norms.length; n += 1) {
      hit = findQuote(norms[n], ev.quote, pageTexts[n]);
      if (hit) break;
    }
    if (hit) {
      matched += 1;
    } else {
      failures.push({
        candidate: cand.name,
        criterion: ev.criterion,
        quote: ev.quote.slice(0, 140),
        pageTextSample: pageTexts[0].slice(0, 0),
      });
    }
  }
  console.log(`${cand.name}: ${evals.length} quotes, pdf pages=${pdf.numPages}`);
}

console.log(`\n=== RESULT: ${matched}/${totalQuotes} quotes matched ===\n`);
for (const f of failures) {
  console.log(`--- MISS: ${f.candidate} / ${f.criterion}`);
  console.log(`    quote: ${JSON.stringify(f.quote)}`);
}

await sql.end();
