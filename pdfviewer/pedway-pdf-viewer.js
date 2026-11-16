/*
 * Pedway PDF Viewer
 * A small, customizable PDF viewer built on Mozilla PDF.js (vendor/pdfjs).
 * It renders PDFs itself (canvas + text layer) instead of using the browser's
 * built-in PDF viewer, so it looks and behaves the same in every modern
 * desktop and mobile browser and stays sharp when zoomed into large maps.
 *
 * Usage (auto-mount):
 *   <div data-pdf-viewer data-src="PedwayMap.pdf" data-layout="floating"></div>
 *   <script type="module" src="pdfviewer/pedway-pdf-viewer.js"></script>
 *
 * Usage (JS):
 *   import { mountPdfViewer } from './pdfviewer/pedway-pdf-viewer.js';
 *   mountPdfViewer(el, { src: 'PedwayMap.pdf', controls: { rotate: false } });
 *
 * Options (all optional except src). The same names work as data- attributes
 * (data-src, data-layout, data-initial-zoom, data-download-name, data-source-url,
 * data-title, data-controls='{"rotate":false,"print":"menu"}',
 * data-mobile-collapse="zoomLevel,fit", data-drag-to-pan="false"):
 *   src            URL of the PDF (same origin, or a server that allows CORS)
 *   layout         'toolbar' (bar across the top) | 'floating' (buttons over the page)
 *   controls       { name: true | false | 'menu' } per control. false removes it,
 *                  'menu' collapses it into the "more" (⋯) menu. Names:
 *                  zoomOut, zoomLevel, zoomIn, fit, page, rotate, download,
 *                  print, fullscreen, source
 *   mobileCollapse control names that move into the ⋯ menu on narrow screens
 *   initialZoom    'page-fit' | 'page-width' | 'auto' | number (1 = 100%)
 *   minZoom/maxZoom  zoom limits (PDF.js caps at 0.1 – 25)
 *   dragToPan      drag with the mouse to move around (default true)
 *   partialRendering  when zoomed in, only draw what's on screen (default true)
 *   textLayer      selectable / Ctrl+F-searchable text (default true; turning it
 *                  off makes zooming lighter on PDFs with thousands of labels)
 *   downloadName   file name for the download button
 *   sourceUrl      link shown by the "source" control (e.g. the official copy)
 *   title          accessible name for the viewer
 *
 * Styling: override the --ppv-* custom properties in pedway-pdf-viewer.css,
 * or target the .ppv-* classes. Each control button has
 * data-control="<name>" so individual buttons can be styled or hidden.
 */

const BASE = new URL('../vendor/pdfjs/', import.meta.url);
const OWN_CSS = new URL('./pedway-pdf-viewer.css', import.meta.url);

const DEFAULT_CONTROLS = {
    zoomOut: true,
    zoomLevel: true,
    zoomIn: true,
    fit: true,
    page: true,
    rotate: 'menu',
    download: 'menu',
    print: 'menu',
    fullscreen: true,
    source: 'menu'
};

const FLOATING_CONTROLS = {
    zoomOut: true,
    zoomLevel: false,
    zoomIn: true,
    fit: false,
    page: false,
    rotate: false,
    download: false,
    print: false,
    fullscreen: true,
    source: false
};

const ORDER = ['page', 'zoomOut', 'zoomLevel', 'zoomIn', 'fit', 'rotate', 'download', 'print', 'source', 'fullscreen'];

const ICONS = {
    zoomIn: '<path d="M12 5v14M5 12h14"/>',
    zoomOut: '<path d="M5 12h14"/>',
    fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    prev: '<path d="M15 6l-6 6 6 6"/>',
    next: '<path d="M9 6l6 6-6 6"/>',
    rotate: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    print: '<path d="M7 9V4h10v5M7 17H4v-7h16v7h-3"/><path d="M7 14h10v6H7z"/>',
    fullscreen: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>',
    exitFullscreen: '<path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5"/>',
    source: '<path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/>',
    more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>'
};

const isIOS = /iP(hone|ad|od)/.test(navigator.platform) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isMobile = isIOS || /Android|Mobi/i.test(navigator.userAgent);

let libPromise = null;

function loadPdfjs() {
    if (!libPromise) {
        libPromise = (async () => {
            const lib = await import(new URL('build/pdf.min.mjs', BASE).href);
            // pdf_viewer.mjs reads the core library from this global.
            globalThis.pdfjsLib = lib;
            lib.GlobalWorkerOptions.workerSrc = new URL('build/pdf.worker.min.mjs', BASE).href;
            const viewer = await import(new URL('web/pdf_viewer.mjs', BASE).href);
            return { lib, viewer };
        })();
        libPromise.catch(() => { libPromise = null; });
    }
    return libPromise;
}

// Adds a stylesheet once (unless the page already links it) and resolves
// when it has loaded, so pages aren't laid out before PDF.js's CSS arrives.
const sheetPromises = new Map();
function addStylesheet(href) {
    if (sheetPromises.has(href)) return sheetPromises.get(href);
    let promise;
    if ([...document.styleSheets].some(s => s.href === href)) {
        promise = Promise.resolve();
    } else {
        const link = [...document.querySelectorAll('link[rel="stylesheet"]')].find(l => l.href === href) ||
            document.head.appendChild(Object.assign(document.createElement('link'), { rel: 'stylesheet', href }));
        promise = new Promise(resolve => {
            link.addEventListener('load', resolve, { once: true });
            link.addEventListener('error', resolve, { once: true });
            setTimeout(resolve, 3000); // never block the viewer on a slow stylesheet
        });
    }
    sheetPromises.set(href, promise);
    return promise;
}

function icon(name) {
    return `<svg class="ppv-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;
}

function el(tag, attrs = {}, html = '') {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (v === false || v == null) continue;
        node.setAttribute(k, v === true ? '' : v);
    }
    if (html) node.innerHTML = html;
    return node;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function readDataOptions(node) {
    const d = node.dataset;
    const opts = {};
    if (d.src) opts.src = d.src;
    if (d.layout) opts.layout = d.layout;
    if (d.title) opts.title = d.title;
    if (d.initialZoom) opts.initialZoom = isNaN(+d.initialZoom) ? d.initialZoom : +d.initialZoom;
    if (d.minZoom) opts.minZoom = +d.minZoom;
    if (d.maxZoom) opts.maxZoom = +d.maxZoom;
    if (d.downloadName) opts.downloadName = d.downloadName;
    if (d.sourceUrl) opts.sourceUrl = d.sourceUrl;
    if (d.dragToPan) opts.dragToPan = d.dragToPan !== 'false';
    if (d.partialRendering) opts.partialRendering = d.partialRendering !== 'false';
    if (d.textLayer) opts.textLayer = d.textLayer !== 'false';
    if (d.mobileCollapse) opts.mobileCollapse = d.mobileCollapse.split(',').map(s => s.trim()).filter(Boolean);
    if (d.controls) {
        try { opts.controls = JSON.parse(d.controls); } catch (e) { console.warn('pedway-pdf-viewer: bad data-controls JSON', e); }
    }
    return opts;
}

export function mountPdfViewer(host, options = {}) {
    if (host.__ppv) return host.__ppv;
    const opts = { ...readDataOptions(host), ...options };
    const layout = opts.layout === 'floating' ? 'floating' : 'toolbar';
    const controls = { ...(layout === 'floating' ? FLOATING_CONTROLS : DEFAULT_CONTROLS), ...(opts.controls || {}) };
    if (!opts.sourceUrl) controls.source = false;
    const mobileCollapse = new Set(opts.mobileCollapse || (layout === 'floating' ? [] : ['zoomLevel', 'fit', 'page']));
    const minZoom = clamp(opts.minZoom ?? 0.1, 0.1, 25);
    const maxZoom = clamp(opts.maxZoom ?? 25, minZoom, 25);
    const initialZoom = opts.initialZoom ?? 'page-fit';
    const dragToPan = opts.dragToPan !== false;
    const partialRendering = opts.partialRendering !== false;
    const textLayer = opts.textLayer !== false;
    const src = opts.src;
    const downloadName = opts.downloadName || (src ? decodeURIComponent(src.split('/').pop().split(/[?#]/)[0]) : 'document.pdf');

    const stylesReady = Promise.all([
        addStylesheet(new URL('web/pdf_viewer.css', BASE).href),
        addStylesheet(OWN_CSS.href)
    ]);

    // ---------- DOM ----------
    host.classList.add('ppv', `ppv--${layout}`);
    host.setAttribute('role', 'region');
    host.setAttribute('aria-label', opts.title || 'PDF viewer');
    host.innerHTML = '';

    const bar = el('div', { class: 'ppv-bar', role: 'toolbar', 'aria-label': 'PDF controls' });
    const stage = el('div', { class: 'ppv-stage' });
    const container = el('div', { class: 'ppv-container', tabindex: '0', 'aria-label': 'Document. Use Ctrl and the mouse wheel or pinch to zoom.' });
    const viewerEl = el('div', { class: 'pdfViewer' });
    const progress = el('div', { class: 'ppv-progress', role: 'progressbar', 'aria-label': 'Loading', 'aria-valuemin': '0', 'aria-valuemax': '100' }, '<span></span>');
    const status = el('div', { class: 'ppv-status', 'aria-live': 'polite' });
    // PDF.js requires an absolutely positioned scroll container; set it inline
    // so it holds even before the stylesheet loads.
    Object.assign(container.style, { position: 'absolute', inset: '0', overflow: 'auto' });
    container.setAttribute('role', 'document');
    container.appendChild(viewerEl);
    stage.append(container, progress, status);
    host.append(bar, stage);

    // Each control is built once for the bar and once for the ⋯ menu; CSS/JS
    // decide which copy is shown.
    const menuWrap = el('div', { class: 'ppv-more' });
    const moreBtn = el('button', { type: 'button', class: 'ppv-btn', 'data-control': 'more', 'aria-label': 'More options', 'aria-haspopup': 'true', 'aria-expanded': 'false' }, icon('more'));
    const menu = el('div', { class: 'ppv-menu', role: 'menu', hidden: true });
    menuWrap.append(moreBtn, menu);

    const parts = {}; // name -> { bar: Element, menu: Element }
    const refs = { zoomSelects: [], pageInputs: [], pageCounts: [], prevBtns: [], nextBtns: [], fsBtns: [] };

    function button(name, label, iconName, onClick, inMenu) {
        const b = el('button', { type: 'button', class: inMenu ? 'ppv-menu-item' : 'ppv-btn', 'data-control': name, 'aria-label': label, title: inMenu ? false : label, role: inMenu ? 'menuitem' : false },
            icon(iconName) + (inMenu ? `<span>${label}</span>` : ''));
        b.addEventListener('click', e => { onClick(e); if (inMenu) closeMenu(); });
        return b;
    }

    function build(name, inMenu) {
        switch (name) {
            case 'zoomOut': return button(name, 'Zoom out', 'zoomOut', () => zoomStep(-1), inMenu);
            case 'zoomIn': return button(name, 'Zoom in', 'zoomIn', () => zoomStep(1), inMenu);
            case 'fit': return button(name, 'Fit to screen', 'fit', toggleFit, inMenu);
            case 'rotate': return button(name, 'Rotate', 'rotate', () => { if (pdfViewer) pdfViewer.pagesRotation = (pdfViewer.pagesRotation + 90) % 360; }, inMenu);
            case 'download': return button(name, 'Download', 'download', download, inMenu);
            case 'print': return button(name, 'Print', 'print', print, inMenu);
            case 'fullscreen': {
                const b = button(name, 'Full screen', 'fullscreen', toggleFullscreen, inMenu);
                refs.fsBtns.push(b);
                return b;
            }
            case 'source': {
                const a = el('a', { class: inMenu ? 'ppv-menu-item' : 'ppv-btn', 'data-control': name, href: opts.sourceUrl, target: '_blank', rel: 'noopener', role: inMenu ? 'menuitem' : false, 'aria-label': 'View original source', title: inMenu ? false : 'View original source' },
                    icon('source') + (inMenu ? '<span>View original source</span>' : ''));
                return a;
            }
            case 'zoomLevel': {
                const wrap = el('label', { class: inMenu ? 'ppv-menu-row' : 'ppv-zoom', 'data-control': name });
                if (inMenu) wrap.appendChild(el('span', {}, 'Zoom'));
                const sel = el('select', { class: 'ppv-select', 'aria-label': 'Zoom level' });
                sel.innerHTML =
                    '<option value="custom" hidden></option>' +
                    '<option value="page-fit">Fit page</option>' +
                    '<option value="page-width">Fit width</option>' +
                    [0.5, 1, 2, 4, 8].map(z => `<option value="${z}">${z * 100}%</option>`).join('');
                sel.addEventListener('change', () => {
                    if (!pdfViewer) return;
                    const v = sel.value;
                    pdfViewer.currentScaleValue = isNaN(+v) ? v : String(clamp(+v, minZoom, maxZoom));
                    if (inMenu) closeMenu();
                });
                wrap.appendChild(sel);
                refs.zoomSelects.push(sel);
                return wrap;
            }
            case 'page': {
                const wrap = el('div', { class: inMenu ? 'ppv-menu-row ppv-page' : 'ppv-page', 'data-control': name });
                const prev = el('button', { type: 'button', class: 'ppv-btn ppv-btn--small', 'aria-label': 'Previous page', title: 'Previous page' }, icon('prev'));
                const next = el('button', { type: 'button', class: 'ppv-btn ppv-btn--small', 'aria-label': 'Next page', title: 'Next page' }, icon('next'));
                const input = el('input', { class: 'ppv-page-input', type: 'text', inputmode: 'numeric', 'aria-label': 'Page number', value: '1' });
                const count = el('span', { class: 'ppv-page-count' }, '/ 1');
                prev.addEventListener('click', () => pdfViewer && pdfViewer.previousPage());
                next.addEventListener('click', () => pdfViewer && pdfViewer.nextPage());
                input.addEventListener('change', () => {
                    const n = parseInt(input.value, 10);
                    if (pdfViewer && n >= 1 && n <= pdfViewer.pagesCount) pdfViewer.currentPageNumber = n;
                    else updatePage();
                });
                input.addEventListener('focus', () => input.select());
                wrap.append(prev, input, count, next);
                refs.pageInputs.push(input);
                refs.pageCounts.push(count);
                refs.prevBtns.push(prev);
                refs.nextBtns.push(next);
                return wrap;
            }
        }
        return null;
    }

    for (const name of ORDER) {
        if (!controls[name]) continue;
        parts[name] = { bar: build(name, false), menu: build(name, true) };
        bar.appendChild(parts[name].bar);
        menu.appendChild(parts[name].menu);
    }
    bar.appendChild(menuWrap);

    // Show each control either in the bar or in the menu.
    let narrow = false;
    function placeControls() {
        let menuCount = 0;
        for (const [name, p] of Object.entries(parts)) {
            const where = controls[name] === 'menu' || (narrow && mobileCollapse.has(name)) ? 'menu' : 'bar';
            p.bar.hidden = where !== 'bar';
            p.menu.hidden = where !== 'menu';
            if (where === 'menu') menuCount++;
        }
        menuWrap.hidden = menuCount === 0;
        bar.hidden = !bar.querySelector(':scope > :not([hidden])');
        if (menuCount === 0) closeMenu();
    }

    function openMenu() {
        menu.hidden = false;
        moreBtn.setAttribute('aria-expanded', 'true');
        const first = menu.querySelector(':scope > :not([hidden]) button, :scope > :not([hidden]) select, :scope > a:not([hidden]), :scope > button:not([hidden])');
        first && first.focus();
    }
    function closeMenu() {
        if (menu.hidden) return;
        menu.hidden = true;
        moreBtn.setAttribute('aria-expanded', 'false');
    }
    moreBtn.addEventListener('click', () => (menu.hidden ? openMenu() : closeMenu()));
    document.addEventListener('pointerdown', e => { if (!menuWrap.contains(e.target)) closeMenu(); });
    menu.addEventListener('keydown', e => { if (e.key === 'Escape') { closeMenu(); moreBtn.focus(); } });

    const ro = new ResizeObserver(() => {
        const isNarrow = host.clientWidth < 560;
        if (isNarrow !== narrow) { narrow = isNarrow; placeControls(); }
    });
    ro.observe(host);
    narrow = host.clientWidth < 560;
    placeControls();

    // ---------- PDF.js ----------
    let pdfViewer = null;
    let pdfDocument = null;
    let lib = null;
    let lastFit = 'page-fit';

    function setStatus(html, isError) {
        status.innerHTML = html;
        status.hidden = !html;
        status.classList.toggle('ppv-status--error', !!isError);
    }

    async function open() {
        if (!src) { setStatus('No PDF specified.', true); return; }
        setStatus('<span class="ppv-spinner" aria-hidden="true"></span>Loading map&hellip;');
        host.classList.add('ppv--loading');
        try {
            const [mods] = await Promise.all([loadPdfjs(), stylesReady]);
            lib = mods.lib;
            const { EventBus, PDFLinkService, PDFViewer } = mods.viewer;
            const eventBus = new EventBus();
            const linkService = new PDFLinkService({ eventBus });
            pdfViewer = new PDFViewer({
                container,
                viewer: viewerEl,
                eventBus,
                linkService,
                textLayerMode: textLayer ? 1 : 0,
                removePageBorders: true,
                annotationMode: lib.AnnotationMode.ENABLE,
                // Render a sharp "detail" canvas of just the visible area when the
                // full page would be too big for one canvas (deep zoom on big maps).
                enableDetailCanvas: true,
                // Record where every drawing operation lands on the first render,
                // then skip everything outside the visible area when zoomed in.
                // Without this, each zoomed-in redraw paints the entire map.
                enableOptimizedPartialRendering: partialRendering,
                // Smaller canvases = faster redraws. The detail canvas covers the
                // visible area (plus a margin) at full sharpness, so the base
                // canvas doesn't need to be huge. iOS also has tight memory limits.
                maxCanvasPixels: isIOS ? 2 ** 22 : isMobile ? 2 ** 23 : 2 ** 24,
                supportsPinchToZoom: true
            });
            linkService.setViewer(pdfViewer);

            eventBus.on('pagesinit', () => {
                pdfViewer.currentScaleValue = String(initialZoom);
                updatePage();
            });
            eventBus.on('scalechanging', updateZoom);
            eventBus.on('pagechanging', updatePage);
            eventBus.on('pagesloaded', updatePage);

            const task = lib.getDocument({
                url: src,
                cMapUrl: new URL('cmaps/', BASE).href,
                cMapPacked: true,
                standardFontDataUrl: new URL('standard_fonts/', BASE).href,
                wasmUrl: new URL('wasm/', BASE).href,
                iccUrl: new URL('iccs/', BASE).href,
                enableXfa: false,
                // GPU-backed canvases (PDF.js's own viewer turns this on too).
                enableHWA: true
            });
            task.onProgress = ({ loaded, total }) => {
                if (!total) return;
                const pct = Math.round((loaded / total) * 100);
                progress.firstChild.style.width = pct + '%';
                progress.setAttribute('aria-valuenow', pct);
            };
            pdfDocument = await task.promise;
            pdfViewer.setDocument(pdfDocument);
            linkService.setDocument(pdfDocument, null);
            setStatus('');
            host.classList.remove('ppv--loading');
            host.classList.add('ppv--ready');
        } catch (err) {
            console.error('pedway-pdf-viewer:', err);
            host.classList.remove('ppv--loading');
            setStatus(`This PDF couldn't be displayed here. <a href="${src}" download="${downloadName}">Download it</a> or <a href="${src}" target="_blank" rel="noopener">open it directly</a>.`, true);
        }
    }

    function updateZoom() {
        if (!pdfViewer) return;
        const value = pdfViewer.currentScaleValue;
        const pct = Math.round(pdfViewer.currentScale * 100) + '%';
        for (const sel of refs.zoomSelects) {
            const match = [...sel.options].find(o => o.value === value);
            const custom = sel.options[0];
            if (match && match !== custom) {
                sel.value = value;
            } else {
                custom.textContent = pct;
                sel.value = 'custom';
            }
            sel.title = pct;
        }
        for (const p of Object.values(parts)) {
            const b = p.bar;
            if (b.dataset.control === 'zoomIn') b.disabled = pdfViewer.currentScale >= maxZoom - 0.001;
            if (b.dataset.control === 'zoomOut') b.disabled = pdfViewer.currentScale <= minZoom + 0.001;
        }
    }

    function updatePage() {
        if (!pdfViewer) return;
        const n = pdfViewer.currentPageNumber;
        const total = pdfViewer.pagesCount || 1;
        refs.pageInputs.forEach(i => { if (document.activeElement !== i) i.value = n; });
        refs.pageCounts.forEach(c => { c.textContent = '/ ' + total; });
        refs.prevBtns.forEach(b => { b.disabled = n <= 1; });
        refs.nextBtns.forEach(b => { b.disabled = n >= total; });
        // A single-page document doesn't need page controls.
        if (parts.page) {
            const single = total <= 1;
            parts.page.bar.classList.toggle('ppv-single', single);
            parts.page.menu.classList.toggle('ppv-single', single);
        }
    }

    // ---------- Zoom ----------
    let pendingFactor = 1;

    function stageOrigin(clientX, clientY) {
        const r = stage.getBoundingClientRect();
        return [clientX - r.left, clientY - r.top];
    }
    function centerOrigin() {
        return [stage.clientWidth / 2, stage.clientHeight / 2];
    }

    // Zoom by a factor while keeping `origin` (stage coordinates) still.
    // drawingDelay > 0 scales the existing canvases with CSS right away and
    // redraws them sharply once the gesture pauses.
    function zoomBy(factor, origin, drawingDelay = -1) {
        if (!pdfViewer || !pdfViewer.pagesCount) return;
        pendingFactor *= factor;
        const cur = pdfViewer.currentScale;
        const target = clamp(cur * pendingFactor, minZoom, maxZoom);
        if (Math.round(target * 100) === Math.round(cur * 100)) {
            if (target === minZoom || target === maxZoom) pendingFactor = 1;
            return; // too small to register yet; keep accumulating
        }
        pendingFactor = 1;
        pdfViewer.updateScale({ scaleFactor: target / cur, origin: origin || centerOrigin(), drawingDelay });
    }

    // Every zoom input scales the current canvases instantly and redraws once
    // input pauses, so repeated clicks / wheel notches don't restart a heavy
    // render each time.
    const REDRAW_DELAY = 350;

    function zoomStep(dir, origin) {
        zoomBy(dir > 0 ? 1.25 : 0.8, origin, REDRAW_DELAY);
    }

    function fitScale() {
        const page = pdfViewer && pdfViewer.getPageView(pdfViewer.currentPageNumber - 1);
        if (!page) return 1;
        return Math.min(container.clientWidth / page.width, container.clientHeight / page.height) * page.scale;
    }

    function toggleFit() {
        if (!pdfViewer) return;
        lastFit = pdfViewer.currentScaleValue === 'page-fit' ? 'page-width' : 'page-fit';
        pdfViewer.currentScaleValue = lastFit;
    }

    // Ctrl/⌘ + wheel zooms around the cursor (trackpad pinch arrives this way
    // in Chrome, Edge and Firefox); Shift + wheel scrolls sideways.
    container.addEventListener('wheel', e => {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            const lines = e.deltaMode === 1;
            const discrete = lines || e.deltaMode === 2 || Math.abs(e.deltaY) >= 50;
            const factor = discrete ? (e.deltaY < 0 ? 1.2 : 1 / 1.2) : Math.exp(-e.deltaY / 100);
            zoomBy(factor, stageOrigin(e.clientX, e.clientY), REDRAW_DELAY);
        } else if (e.shiftKey && !e.deltaX && e.deltaY) {
            e.preventDefault();
            const px = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaMode === 2 ? e.deltaY * container.clientWidth : e.deltaY;
            container.scrollLeft += px;
        }
    }, { passive: false });

    // Safari (macOS) trackpad pinch uses its own gesture events.
    let gestureStartScale = 1;
    let touchPinch = null;
    container.addEventListener('gesturestart', e => {
        e.preventDefault();
        gestureStartScale = pdfViewer ? pdfViewer.currentScale : 1;
    });
    container.addEventListener('gesturechange', e => {
        e.preventDefault();
        if (touchPinch || !pdfViewer) return; // iOS touch pinch is handled below
        const target = gestureStartScale * e.scale;
        zoomBy(target / (pdfViewer.currentScale * pendingFactor), stageOrigin(e.clientX, e.clientY), REDRAW_DELAY);
    });
    container.addEventListener('gestureend', e => e.preventDefault());

    // Touch: two-finger pinch zoom + pan, double-tap to zoom.
    const dist = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const mid = (a, b) => [(a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2];
    let lastTap = null;
    let tapStart = null;

    container.addEventListener('touchstart', e => {
        if (e.touches.length === 2) {
            touchPinch = { d: dist(e.touches[0], e.touches[1]), m: mid(e.touches[0], e.touches[1]) };
            tapStart = null;
        } else if (e.touches.length === 1) {
            const t = e.touches[0];
            tapStart = { x: t.clientX, y: t.clientY, time: e.timeStamp };
        } else {
            tapStart = null;
        }
    }, { passive: true });

    container.addEventListener('touchmove', e => {
        if (tapStart && e.touches.length === 1) {
            const t = e.touches[0];
            if (Math.hypot(t.clientX - tapStart.x, t.clientY - tapStart.y) > 10) tapStart = null;
        }
        if (!touchPinch || e.touches.length !== 2) return;
        e.preventDefault();
        const d = dist(e.touches[0], e.touches[1]);
        const m = mid(e.touches[0], e.touches[1]);
        if (pdfViewer && pdfViewer.pagesCount) {
            const pan = [m[0] - touchPinch.m[0], m[1] - touchPinch.m[1]];
            const factor = d / touchPinch.d;
            const cur = pdfViewer.currentScale;
            const target = clamp(cur * factor, minZoom, maxZoom);
            if (Math.round(target * 100) !== Math.round(cur * 100)) {
                pdfViewer.updateScale({ scaleFactor: target / cur, origin: stageOrigin(m[0], m[1]), drawingDelay: REDRAW_DELAY, pan });
                touchPinch.d = d;
            } else if (pan[0] || pan[1]) {
                pdfViewer.panBy(pan[0], pan[1]);
            }
        }
        touchPinch.m = m;
    }, { passive: false });

    container.addEventListener('touchend', e => {
        if (e.touches.length < 2) touchPinch = null;
        if (!tapStart || e.touches.length || e.changedTouches.length !== 1) return;
        const t = e.changedTouches[0];
        const quick = e.timeStamp - tapStart.time < 300;
        tapStart = null;
        if (!quick) return;
        if (lastTap && e.timeStamp - lastTap.time < 320 && Math.hypot(t.clientX - lastTap.x, t.clientY - lastTap.y) < 30) {
            lastTap = null;
            e.preventDefault();
            doubleTapZoom(t.clientX, t.clientY);
        } else {
            lastTap = { x: t.clientX, y: t.clientY, time: e.timeStamp };
        }
    });

    function doubleTapZoom(x, y) {
        if (!pdfViewer) return;
        const fit = fitScale();
        // Zoom in 2x each double tap; once well zoomed in, go back to fit.
        if (pdfViewer.currentScale >= Math.min(maxZoom, fit * 8) - 0.01) {
            pdfViewer.currentScaleValue = 'page-fit';
        } else {
            zoomBy(2, stageOrigin(x, y), REDRAW_DELAY);
        }
    }

    // Mouse drag to pan (like a map). Text can still be found with Ctrl+F.
    if (dragToPan) {
        host.classList.add('ppv--drag');
        let drag = null;
        container.addEventListener('pointerdown', e => {
            if (e.pointerType !== 'mouse' || e.button !== 0) return;
            if (e.target.closest('a, button, input, select, textarea')) return;
            // Leave clicks on the scrollbars alone.
            const r = container.getBoundingClientRect();
            if (e.clientX - r.left >= container.clientWidth || e.clientY - r.top >= container.clientHeight) return;
            drag = { x: e.clientX, y: e.clientY, left: container.scrollLeft, top: container.scrollTop, moved: false };
            container.setPointerCapture(e.pointerId);
        });
        container.addEventListener('pointermove', e => {
            if (!drag) return;
            const dx = e.clientX - drag.x;
            const dy = e.clientY - drag.y;
            if (!drag.moved && Math.hypot(dx, dy) > 3) {
                drag.moved = true;
                host.classList.add('ppv--dragging');
                window.getSelection()?.removeAllRanges();
            }
            if (drag.moved) {
                container.scrollLeft = drag.left - dx;
                container.scrollTop = drag.top - dy;
                e.preventDefault();
            }
        });
        const endDrag = e => {
            if (!drag) return;
            drag = null;
            host.classList.remove('ppv--dragging');
            if (container.hasPointerCapture(e.pointerId)) container.releasePointerCapture(e.pointerId);
        };
        container.addEventListener('pointerup', endDrag);
        container.addEventListener('pointercancel', endDrag);
        // Double-click zooms in at the cursor.
        container.addEventListener('dblclick', e => {
            if (e.target.closest('a, button, input, select')) return;
            e.preventDefault();
            window.getSelection()?.removeAllRanges();
            zoomBy(e.shiftKey ? 0.5 : 2, stageOrigin(e.clientX, e.clientY), REDRAW_DELAY);
        });
    }

    // Keyboard: + / - / 0 (with or without Ctrl) while the viewer has focus.
    host.addEventListener('keydown', e => {
        if (e.target.matches('input, select, textarea')) return;
        if (e.altKey) return;
        const k = e.key;
        if (k === '+' || k === '=') { e.preventDefault(); zoomStep(1); }
        else if (k === '-' || k === '_') { e.preventDefault(); zoomStep(-1); }
        else if (k === '0' && pdfViewer) { e.preventDefault(); pdfViewer.currentScaleValue = 'page-fit'; }
        else if (k === 'Escape' && host.classList.contains('ppv--fill')) { exitFill(); }
    });

    // ---------- Fullscreen ----------
    const canFullscreen = !!(host.requestFullscreen || host.webkitRequestFullscreen);
    function isFull() {
        return (document.fullscreenElement || document.webkitFullscreenElement) === host || host.classList.contains('ppv--fill');
    }
    function exitFill() {
        host.classList.remove('ppv--fill');
        document.documentElement.classList.remove('ppv-noscroll');
        syncFullscreen();
    }
    function toggleFullscreen() {
        if (isFull()) {
            if (host.classList.contains('ppv--fill')) exitFill();
            else (document.exitFullscreen || document.webkitExitFullscreen).call(document);
            return;
        }
        if (canFullscreen) {
            const req = host.requestFullscreen || host.webkitRequestFullscreen;
            Promise.resolve(req.call(host)).catch(() => fill());
        } else {
            fill(); // iPhone Safari has no element fullscreen; fill the window instead
        }
    }
    function fill() {
        host.classList.add('ppv--fill');
        document.documentElement.classList.add('ppv-noscroll');
        syncFullscreen();
    }
    function syncFullscreen() {
        const on = isFull();
        refs.fsBtns.forEach(b => {
            b.setAttribute('aria-label', on ? 'Exit full screen' : 'Full screen');
            if (b.title) b.title = on ? 'Exit full screen' : 'Full screen';
            b.querySelector('svg').outerHTML = icon(on ? 'exitFullscreen' : 'fullscreen');
            const span = b.querySelector('span');
            if (span) span.textContent = on ? 'Exit full screen' : 'Full screen';
        });
        // Keep roughly the same view when the size changes.
        if (pdfViewer && pdfViewer.currentScaleValue && isNaN(+pdfViewer.currentScaleValue)) {
            requestAnimationFrame(() => { pdfViewer.currentScaleValue = pdfViewer.currentScaleValue; });
        }
    }
    document.addEventListener('fullscreenchange', syncFullscreen);
    document.addEventListener('webkitfullscreenchange', syncFullscreen);

    // ---------- Download / print ----------
    function download() {
        const a = el('a', { href: src, download: downloadName });
        document.body.appendChild(a);
        a.click();
        a.remove();
    }

    async function print() {
        if (!pdfDocument) return;
        setStatus('<span class="ppv-spinner" aria-hidden="true"></span>Preparing to print&hellip;');
        const frame = el('iframe', { class: 'ppv-print-frame', title: 'Print', 'aria-hidden': 'true' });
        document.body.appendChild(frame);
        try {
            const doc = frame.contentDocument;
            doc.open();
            doc.write('<!doctype html><title>Print</title><style>@page{margin:0}html,body{margin:0}img{display:block;width:100%;height:auto;page-break-after:always;break-after:page}img:last-child{page-break-after:auto;break-after:auto}</style><body></body>');
            doc.close();
            const maxPx = isIOS ? 2 ** 23 : 2 ** 25;
            for (let i = 1; i <= pdfDocument.numPages; i++) {
                const page = await pdfDocument.getPage(i);
                let vp = page.getViewport({ scale: 150 / 72, rotation: pdfViewer.pagesRotation });
                const px = vp.width * vp.height;
                if (px > maxPx) vp = page.getViewport({ scale: (150 / 72) * Math.sqrt(maxPx / px), rotation: pdfViewer.pagesRotation });
                const canvas = document.createElement('canvas');
                canvas.width = Math.floor(vp.width);
                canvas.height = Math.floor(vp.height);
                await page.render({ canvas, viewport: vp, intent: 'print' }).promise;
                const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
                canvas.width = canvas.height = 0;
                const img = doc.createElement('img');
                img.src = URL.createObjectURL(blob);
                await img.decode().catch(() => {});
                doc.body.appendChild(img);
            }
            setStatus('');
            frame.contentWindow.focus();
            frame.contentWindow.print();
        } catch (err) {
            console.error('pedway-pdf-viewer print:', err);
            setStatus('Printing failed. Try downloading the PDF instead.', true);
            setTimeout(() => setStatus(''), 4000);
        } finally {
            setTimeout(() => {
                frame.contentDocument?.querySelectorAll('img').forEach(i => URL.revokeObjectURL(i.src));
                frame.remove();
            }, 60000);
        }
    }

    open();

    const api = {
        get viewer() { return pdfViewer; },
        get document() { return pdfDocument; },
        zoomIn: () => zoomStep(1),
        zoomOut: () => zoomStep(-1),
        fit: () => { if (pdfViewer) pdfViewer.currentScaleValue = 'page-fit'; },
        setControl(name, value) { if (parts[name]) { controls[name] = value; placeControls(); } },
        toggleFullscreen
    };
    host.__ppv = api;
    return api;
}

function autoMount() {
    document.querySelectorAll('[data-pdf-viewer]').forEach(n => mountPdfViewer(n));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', autoMount);
else autoMount();
