// Historical Pedway Maps timeline: native scroll-snap carousel with a
// station-style route line, prev/next buttons, keyboard support and a
// full-size viewer. No dependencies.
(function () {
    'use strict';

    var root = document.getElementById('timeline');
    if (!root) return;

    var track = root.querySelector('[data-pw-track]');
    var cards = Array.prototype.slice.call(track.querySelectorAll('.pw-card'));
    var stopsList = root.querySelector('[data-pw-stops]');
    var prevBtn = root.querySelector('[data-pw-prev]');
    var nextBtn = root.querySelector('[data-pw-next]');
    var indexEl = root.querySelector('[data-pw-index]');
    var totalEl = root.querySelector('[data-pw-total]');
    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var current = -1;

    // OpenStreetMap is a living document, so label it with this year.
    var thisYear = String(new Date().getFullYear());
    root.querySelectorAll('[data-pw-current-year]').forEach(function (card) {
        card.dataset.year = thisYear;
        var yearEl = card.querySelector('.pw-card__year');
        if (yearEl) yearEl.textContent = thisYear;
    });
    var footerYear = document.querySelector('[data-pw-footer-year]');
    if (footerYear) footerYear.textContent = thisYear;
    var firstLabel = root.querySelector('[data-pw-first]');
    if (firstLabel) firstLabel.textContent = cards[0].dataset.year;

    // "You are here" teardrop: purple drop with the point up at the station,
    // yellow disc with the label (modern-map symbol in the site's colours).
    var HERE_SVG =
        '<svg viewBox="0 0 60 78" xmlns="http://www.w3.org/2000/svg">' +
        '<path d="M30 0 L52.2 36.5 A26 26 0 1 1 7.8 36.5 Z" fill="#302665"/>' +
        '<circle cx="30" cy="50" r="21.5" fill="#FFE385"/>' +
        '<g fill="#302665" font-family="Roboto, Arial, sans-serif" font-weight="900" font-size="9" text-anchor="middle">' +
        '<text x="30" y="43">YOU</text><text x="30" y="53">ARE</text><text x="30" y="63">HERE</text>' +
        '</g></svg>';

    // Build one station per card on the route line.
    var stops = cards.map(function (card, i) {
        var li = document.createElement('li');
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'pw-stop';
        btn.setAttribute('aria-label', card.dataset.year + ': ' + card.querySelector('.pw-card__title').textContent);
        btn.innerHTML = '<span class="pw-stop__dot" aria-hidden="true"></span>' +
            '<span class="pw-stop__year" aria-hidden="true"></span>' +
            '<span class="pw-stop__here" aria-hidden="true">' + HERE_SVG + '</span>';
        btn.querySelector('.pw-stop__year').textContent = card.dataset.year;
        btn.addEventListener('click', function () { goTo(i); });
        li.appendChild(btn);
        stopsList.appendChild(li);
        card.setAttribute('aria-label', (i + 1) + ' of ' + cards.length);
        return li;
    });
    totalEl.textContent = cards.length;

    function goTo(i, instant) {
        i = Math.max(0, Math.min(cards.length - 1, i));
        var card = cards[i];
        var left = card.offsetLeft - (track.clientWidth - card.offsetWidth) / 2;
        track.scrollTo({ left: left, behavior: instant || reduceMotion ? 'auto' : 'smooth' });
        setCurrent(i);
    }

    function setCurrent(i) {
        if (i === current) return;
        current = i;
        cards.forEach(function (card, n) {
            var on = n === i;
            card.classList.toggle('is-current', on);
            // Only the centred card's controls are tabbable.
            card.querySelectorAll('a, button').forEach(function (el) {
                el.tabIndex = on ? 0 : -1;
            });
            card.setAttribute('aria-hidden', on ? 'false' : 'true');
        });
        stops.forEach(function (li, n) {
            li.classList.toggle('is-passed', n < i);
            li.classList.toggle('is-current', n === i);
            li.firstChild.setAttribute('aria-current', n === i ? 'true' : 'false');
        });
        indexEl.textContent = i + 1;
        prevBtn.disabled = i === 0;
        nextBtn.disabled = i === cards.length - 1;

        // Keep the current station visible on the route line.
        var route = stopsList.parentElement;
        var stop = stops[i];
        var target = stop.offsetLeft - (route.clientWidth - stop.offsetWidth) / 2;
        route.scrollTo({ left: target, behavior: reduceMotion ? 'auto' : 'smooth' });

        if (history.replaceState) history.replaceState(null, '', '#' + cards[i].id);
    }

    // Work out which card is centred while the user swipes / scrolls.
    var ticking = false;
    function nearestToCentre() {
        var mid = track.scrollLeft + track.clientWidth / 2;
        var best = 0;
        var bestDist = Infinity;
        cards.forEach(function (card, n) {
            var d = Math.abs(card.offsetLeft + card.offsetWidth / 2 - mid);
            if (d < bestDist) { bestDist = d; best = n; }
        });
        return best;
    }
    track.addEventListener('scroll', function () {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(function () {
            ticking = false;
            setCurrent(nearestToCentre());
        });
    }, { passive: true });

    prevBtn.addEventListener('click', function () { goTo(current - 1); });
    nextBtn.addEventListener('click', function () { goTo(current + 1); });

    // Clicking a dimmed neighbour brings it to the centre instead of opening it.
    cards.forEach(function (card, i) {
        card.addEventListener('click', function (e) {
            if (i !== current) {
                e.preventDefault();
                e.stopPropagation();
                goTo(i);
            }
        }, true);
        card.querySelector('.pw-card__frame').addEventListener('click', function () {
            if (i === current) openViewer(card);
        });
    });

    // Arrow keys anywhere on the page (except inside the viewer).
    document.addEventListener('keydown', function (e) {
        if (viewer.open || e.altKey || e.ctrlKey || e.metaKey) return;
        var tag = (e.target.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
        var map = { ArrowLeft: current - 1, ArrowRight: current + 1, Home: 0, End: cards.length - 1 };
        if (e.key in map) {
            e.preventDefault();
            goTo(map[e.key]);
        }
    });

    // Re-centre after rotation / resize.
    var resizeTimer;
    window.addEventListener('resize', function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () {
            var i = current;
            current = -1;
            goTo(i, true);
        }, 150);
    });

    // ---------- Full-size viewer ----------
    var viewer = document.querySelector('[data-pw-viewer]');
    var viewerImg = viewer.querySelector('[data-pw-viewer-img]');
    var viewerTitle = viewer.querySelector('[data-pw-viewer-title]');
    var viewerStage = viewer.querySelector('[data-pw-viewer-stage]');

    function openViewer(card) {
        var img = card.querySelector('img');
        viewerImg.src = img.currentSrc || img.src;
        viewerImg.alt = img.alt;
        viewerTitle.textContent = card.dataset.year + ' – ' + card.querySelector('.pw-card__title').textContent;
        viewerStage.classList.remove('is-zoomed');
        if (viewer.showModal) viewer.showModal();
        else window.open(viewerImg.src, '_blank');
    }

    viewer.querySelector('[data-pw-viewer-close]').addEventListener('click', function () { viewer.close(); });
    // Tap the dark area around the image to close.
    viewer.addEventListener('click', function (e) {
        if (e.target === viewer || e.target === viewerStage) viewer.close();
    });
    viewerImg.addEventListener('click', function (e) {
        var zoomed = viewerStage.classList.toggle('is-zoomed');
        if (zoomed) {
            // Zoom towards the tapped point.
            var rect = viewerImg.getBoundingClientRect();
            var fx = (e.clientX - rect.left) / rect.width;
            var fy = (e.clientY - rect.top) / rect.height;
            requestAnimationFrame(function () {
                viewerStage.scrollLeft = fx * viewerImg.offsetWidth - viewerStage.clientWidth / 2;
                viewerStage.scrollTop = fy * viewerImg.offsetHeight - viewerStage.clientHeight / 2;
            });
        }
    });
    viewer.addEventListener('close', function () {
        var card = cards[current];
        if (card) card.querySelector('.pw-card__frame').focus({ preventScroll: true });
    });

    // ---------- Start ----------
    var start = 0;
    if (location.hash) {
        var fromHash = cards.findIndex(function (c) { return '#' + c.id === location.hash; });
        if (fromHash >= 0) start = fromHash;
    }
    // Wait a frame so layout (and container-query widths) are settled.
    requestAnimationFrame(function () { goTo(start, true); });
})();
