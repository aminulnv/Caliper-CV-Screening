// @ts-nocheck
import React from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { Icon } from '@/caliper/ui'
import { api } from '@/services/api'
import {
  buildPageTextLayout,
  findQuoteHighlights,
} from '@/lib/cv-pdf-highlight'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

const WIDTH_EPSILON = 16;

async function paintPage(page, cssWidth) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const base = page.getViewport({ scale: 1 });
  const displayScale = cssWidth / base.width;
  const viewport = page.getViewport({ scale: displayScale });
  const renderViewport = page.getViewport({ scale: displayScale * dpr });

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = renderViewport.width;
  canvas.height = renderViewport.height;
  canvas.className = 'cv-viewer__page';
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${viewport.height}px`;

  await page.render({ canvasContext: ctx, viewport: renderViewport, canvas }).promise;

  const textContent = await page.getTextContent();
  const layout = buildPageTextLayout(
    0,
    textContent.items,
    viewport,
    cssWidth,
    viewport.height,
  );

  return { canvas, displayHeight: viewport.height, layout };
}

function applyHighlights(container, layouts, highlightQuote, highlightKind, highlightLabel) {
  container.querySelectorAll('.cv-viewer__page-shell').forEach((shell) => {
    shell.classList.remove('is-source-active');
  });
  container.querySelectorAll('.cv-viewer__hl-layer').forEach((layer) => {
    layer.replaceChildren();
  });

  if (!highlightQuote?.trim()) return null;

  const hits = findQuoteHighlights(layouts, highlightQuote);
  if (!hits.length) return null;

  let firstBand = null;
  const isFlag = highlightKind === 'flag';
  const pinLabel = highlightLabel?.trim() || (isFlag ? 'Red flag source' : 'Criterion source');

  for (const hit of hits) {
    const wrap = container.querySelector(`[data-page-index="${hit.pageIndex}"]`);
    const shell = wrap?.querySelector('.cv-viewer__page-shell');
    const layer = wrap?.querySelector('.cv-viewer__hl-layer');
    if (!layer || !shell) continue;

    shell.classList.add('is-source-active');

    hit.rects.forEach((rect, bandIndex) => {
      const band = document.createElement('div');
      band.className = `cv-viewer__hl-band${isFlag ? ' cv-viewer__hl-band--flag' : ''}`;
      band.style.left = `${rect.left}px`;
      band.style.top = `${rect.top}px`;
      band.style.width = `${Math.max(rect.width, 8)}px`;
      band.style.height = `${Math.max(rect.height, 10)}px`;

      const shine = document.createElement('span');
      shine.className = 'cv-viewer__hl-band-shine';
      band.appendChild(shine);
      layer.appendChild(band);
      if (!firstBand) firstBand = band;

      if (bandIndex === 0 && hit.pageIndex === hits[0].pageIndex && !layer.querySelector('.cv-viewer__hl-pin')) {
        const pin = document.createElement('div');
        pin.className = `cv-viewer__hl-pin${isFlag ? ' cv-viewer__hl-pin--flag' : ''}`;
        pin.style.left = `${Math.max(4, rect.left)}px`;
        pin.style.top = `${Math.max(4, rect.top - 28)}px`;
        const safeLabel = pinLabel.replace(/</g, '&lt;');
        pin.innerHTML = `<span class="cv-viewer__hl-pin-dot" aria-hidden="true"></span><span class="cv-viewer__hl-pin-label">${safeLabel}</span>`;
        layer.appendChild(pin);
      }
    });
  }

  return firstBand;
}

export function CvViewer({ candidateId, candidateName, highlightQuote, highlightKind, highlightLabel }) {
  const [pdfUrl, setPdfUrl] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [pageCount, setPageCount] = React.useState(0);
  const [rendering, setRendering] = React.useState(false);
  const [highlightFound, setHighlightFound] = React.useState(true);

  const pagesRef = React.useRef(null);
  const pdfDocRef = React.useRef(null);
  const layoutsRef = React.useRef([]);
  const lastWidthRef = React.useRef(0);
  const renderGenRef = React.useRef(0);
  const renderingRef = React.useRef(false);

  React.useEffect(() => {
    let revoked = false;
    let objectUrl = null;
    setLoading(true);
    setError(null);
    setPdfUrl(null);
    setPageCount(0);
    pdfDocRef.current = null;
    layoutsRef.current = [];
    lastWidthRef.current = 0;
    if (pagesRef.current) pagesRef.current.replaceChildren();

    api.candidates
      .fetchCvBlobUrl(candidateId)
      .then((url) => {
        if (revoked) {
          URL.revokeObjectURL(url);
          return;
        }
        objectUrl = url;
        setPdfUrl(url);
      })
      .catch((e) => {
        if (!revoked) setError(e?.message ?? 'Could not load CV');
      })
      .finally(() => {
        if (!revoked) setLoading(false);
      });

    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      pdfDocRef.current = null;
    };
  }, [candidateId]);

  const renderAllPages = React.useCallback(async () => {
    const container = pagesRef.current;
    const pdf = pdfDocRef.current;
    if (!container || !pdf) return;

    const cssWidth = Math.max(container.clientWidth - 4, 280);
    if (
      renderingRef.current
      || (lastWidthRef.current > 0 && Math.abs(cssWidth - lastWidthRef.current) < WIDTH_EPSILON)
    ) {
      return;
    }

    const gen = ++renderGenRef.current;
    const hadContent = container.childElementCount > 0;
    renderingRef.current = true;
    if (!hadContent) setRendering(true);
    lastWidthRef.current = cssWidth;

    const scrollTop = container.scrollTop;
    const total = pdf.numPages;

    try {
      const pageNums = Array.from({ length: total }, (_, i) => i + 1);
      const pages = await Promise.all(pageNums.map((n) => pdf.getPage(n)));
      if (gen !== renderGenRef.current) return;

      const painted = await Promise.all(
        pages.map(async (page, i) => {
          const result = await paintPage(page, cssWidth);
          result.layout.pageIndex = i;
          return result;
        }),
      );
      if (gen !== renderGenRef.current) return;

      layoutsRef.current = painted.map((p) => p.layout);

      const fragment = document.createDocumentFragment();
      for (let i = 0; i < total; i += 1) {
        const wrap = document.createElement('div');
        wrap.className = 'cv-viewer__page-wrap';
        wrap.dataset.pageIndex = String(i);
        wrap.style.minHeight = `${painted[i].displayHeight + (total > 1 ? 22 : 0)}px`;

        if (total > 1) {
          const label = document.createElement('div');
          label.className = 'cv-viewer__page-label mono muted';
          label.textContent = `Page ${i + 1} of ${total}`;
          wrap.appendChild(label);
        }

        const shell = document.createElement('div');
        shell.className = 'cv-viewer__page-shell';
        shell.style.width = `${cssWidth}px`;
        shell.style.height = `${painted[i].displayHeight}px`;

        const hlLayer = document.createElement('div');
        hlLayer.className = 'cv-viewer__hl-layer';
        hlLayer.setAttribute('aria-hidden', 'true');

        shell.appendChild(painted[i].canvas);
        shell.appendChild(hlLayer);
        wrap.appendChild(shell);
        fragment.appendChild(wrap);
      }

      container.replaceChildren(fragment);
      container.scrollTop = scrollTop;
      setPageCount(total);
    } catch (e) {
      if (gen === renderGenRef.current) {
        setError(e?.message ?? 'Could not render CV');
      }
    } finally {
      if (gen === renderGenRef.current) {
        renderingRef.current = false;
        setRendering(false);
      }
    }
  }, []);

  React.useEffect(() => {
    if (!pdfUrl) return undefined;

    let cancelled = false;
    pdfDocRef.current = null;
    layoutsRef.current = [];
    lastWidthRef.current = 0;

    pdfjsLib
      .getDocument({ url: pdfUrl, withCredentials: false })
      .promise.then((pdf) => {
        if (cancelled) return;
        pdfDocRef.current = pdf;
        setPageCount(pdf.numPages);
        requestAnimationFrame(() => renderAllPages());
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message ?? 'Could not load CV');
      });

    return () => {
      cancelled = true;
      renderGenRef.current += 1;
      renderingRef.current = false;
    };
  }, [pdfUrl, renderAllPages]);

  React.useEffect(() => {
    if (!pdfUrl || !pdfDocRef.current) return undefined;

    let resizeTimer;
    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        lastWidthRef.current = 0;
        renderAllPages();
      }, 350);
    };

    window.addEventListener('resize', onResize);
    return () => {
      clearTimeout(resizeTimer);
      window.removeEventListener('resize', onResize);
    };
  }, [pdfUrl, renderAllPages]);

  React.useEffect(() => {
    const container = pagesRef.current;
    if (!container || !layoutsRef.current.length) return;

    const first = applyHighlights(
      container,
      layoutsRef.current,
      highlightQuote,
      highlightKind,
      highlightLabel,
    );
    setHighlightFound(Boolean(first));

    if (first) {
      first.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightQuote, highlightKind, highlightLabel, pageCount, rendering]);

  const busy = loading || rendering;

  return (
    <div className="cv-viewer">
      <div className="cv-viewer__head">
        <span className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          CV{pageCount > 0 ? ` · ${pageCount} page${pageCount === 1 ? '' : 's'}` : ''}
        </span>
        <div className="cv-viewer__head-actions">
          {highlightQuote && !busy && (
            <span
              className={`cv-viewer__hl-hint${highlightFound ? ' cv-viewer__hl-hint--ok' : ' cv-viewer__hl-hint--warn'}`}
            >
              {highlightFound
                ? (highlightKind === 'flag' ? 'Flag source in CV' : 'Matching text in CV')
                : 'Quote not found in PDF — check wording'}
            </span>
          )}
          {pdfUrl && (
            <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="cv-viewer__open">
              <Icon name="eye" size={12} />
              Open in new tab
            </a>
          )}
        </div>
      </div>

      <div className="cv-viewer__stage">
        <div
          ref={pagesRef}
          className={`cv-viewer__pages${busy ? ' cv-viewer__pages--busy' : ''}`}
          aria-label={candidateName ? `CV — ${candidateName}` : 'Candidate CV'}
          aria-busy={busy}
        />
        {busy && !error && (
          <div className="cv-viewer__overlay muted">
            {loading ? 'Loading CV…' : 'Rendering pages…'}
          </div>
        )}
        {!loading && error && (
          <div className="cv-viewer__overlay" style={{ color: 'var(--warn-ink)' }}>
            <Icon name="alert" size={14} />
            <span>{error}</span>
          </div>
        )}
      </div>
    </div>
  );
}
