/* SDD mockup review overlay. One script tag, no dependencies.
 *
 *   <script src="http://127.0.0.1:4747/__sdd/review.js" data-change="2026-11-20-csv-export"></script>
 *
 * Reviewers press C (or the Comment button), click any element and type.
 * Comments are saved through the review server into mockup/feedback.json and
 * mockup/feedback.md, where the agent reads them. Without a server they stay in
 * localStorage and leave through "Copy for agent" or "Download".
 *
 * Markup contract (all optional, all improve the export):
 *   data-sdd-screen="orders-list"   screen a block belongs to
 *   data-sdd-state="empty"          state being shown
 *   data-sdd-id="orders.export"     stable element name
 *   data-sdd-ac="AC-3"              acceptance criterion the element shows
 */
(function () {
  'use strict';
  if (window.__sddReview) return;

  var script = document.currentScript;
  var change = (script && script.dataset.change) || 'mockup';
  var endpoint = (script && script.dataset.endpoint) ||
    (script && script.src ? new URL('/__sdd/feedback', script.src).href : '/__sdd/feedback');
  var storageKey = 'sdd-review:' + change;

  var comments = [];
  var online = false;
  var commenting = false;
  var panelOpen = false;
  var draftTarget = null;

  // ---------- storage ----------
  function load() {
    return fetch(endpoint, { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (doc) { online = true; comments = doc.comments || []; })
      .catch(function () {
        online = false;
        try { comments = JSON.parse(localStorage.getItem(storageKey) || '[]'); } catch (e) { comments = []; }
      });
  }

  // Each change is sent as one operation and applied by the server to the file as it is now.
  // The whole list is never written back, so a resolution the agent wrote into feedback.json survives.
  function save(op) {
    try { localStorage.setItem(storageKey, JSON.stringify(comments)); } catch (e) { /* storage unavailable */ }
    if (!online || !op) return Promise.resolve();
    return fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(op)
    }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (doc) { comments = doc.comments || []; render(); })
      .catch(function () { online = false; render(); });
  }

  // Pick up what the agent changed on disk while the page stays open.
  function refresh() {
    if (!online || draftTarget) return;
    fetch(endpoint, { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (doc) {
        var next = JSON.stringify(doc.comments || []);
        if (next !== JSON.stringify(comments)) { comments = doc.comments || []; render(); }
      })
      .catch(function () { /* keep what we have; the next save reports a lost server */ });
  }

  // ---------- describing the clicked element ----------
  function cssPath(el) {
    var parts = [];
    while (el && el.nodeType === 1 && el !== document.body && parts.length < 6) {
      if (el.dataset && el.dataset.sddId) { parts.unshift('[data-sdd-id="' + el.dataset.sddId + '"]'); break; }
      if (el.id) { parts.unshift('#' + CSS.escape(el.id)); break; }
      var tag = el.tagName.toLowerCase();
      var same = el.parentElement
        ? Array.prototype.filter.call(el.parentElement.children, function (c) { return c.tagName === el.tagName; })
        : [el];
      parts.unshift(same.length > 1 ? tag + ':nth-of-type(' + (same.indexOf(el) + 1) + ')' : tag);
      el = el.parentElement;
    }
    return parts.join(' > ');
  }

  function closestData(el, name) {
    var hit = el.closest('[data-sdd-' + name + ']');
    return hit ? hit.getAttribute('data-sdd-' + name) : null;
  }

  function visibleScreen() {
    var screens = document.querySelectorAll('[data-sdd-screen]');
    for (var i = 0; i < screens.length; i++) {
      if (screens[i].getClientRects().length) return screens[i].getAttribute('data-sdd-screen');
    }
    return location.pathname + location.hash;
  }

  function describe(el) {
    var named = el.closest('[data-sdd-id]');
    var target = el;
    return {
      sddId: named ? named.getAttribute('data-sdd-id') : null,
      exact: named === el,
      selector: cssPath(target),
      tag: target.tagName.toLowerCase(),
      text: (target.innerText || target.getAttribute('aria-label') || target.getAttribute('placeholder') || '')
        .replace(/\s+/g, ' ').trim().slice(0, 80),
      ac: closestData(target, 'ac'),
      screen: closestData(target, 'screen') || visibleScreen(),
      state: closestData(target, 'state') || document.documentElement.getAttribute('data-sdd-state') || null
    };
  }

  // "orders.table > td" when the click landed inside a named element, the plain name when it hit it.
  function label(t) {
    if (!t.sddId) return t.selector;
    return t.exact === false ? t.sddId + ' > ' + t.tag : t.sddId;
  }

  function findTarget(c) {
    var el = null;
    try {
      if (c.target.selector) el = document.querySelector(c.target.selector);
      if (!el && c.target.sddId) el = document.querySelector('[data-sdd-id="' + c.target.sddId + '"]');
    } catch (e) { el = null; }
    return el && el.getClientRects().length ? el : null;
  }

  // ---------- export ----------
  function toMarkdown() {
    var open = comments.filter(function (c) { return c.status === 'open'; });
    var lines = ['# Mockup feedback: ' + change, '',
      'Open: ' + open.length + ' · Resolved: ' + (comments.length - open.length), ''];
    comments.forEach(function (c, i) {
      var t = c.target;
      lines.push('## ' + (i + 1) + '. [' + c.status + '] ' + label(t) + (t.ac ? ' (' + t.ac + ')' : ''));
      lines.push('');
      lines.push('> ' + c.body.replace(/\n/g, '\n> '));
      lines.push('');
      lines.push('- Screen: ' + t.screen + (t.state ? ' · state: ' + t.state : ''));
      lines.push('- Element: <' + t.tag + '>' + (t.text ? ' "' + t.text + '"' : '') + ' · `' + t.selector + '`');
      lines.push('- Viewport: ' + c.viewport + ' · ' + c.createdAt);
      if (c.resolution) lines.push('- Resolution: ' + c.resolution);
      lines.push('');
    });
    return lines.join('\n');
  }

  function copyForAgent() {
    var text = toMarkdown();
    var done = function () { flash('Copied ' + comments.length + ' comment(s)'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
    } else { fallbackCopy(text); done(); }
  }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e) { /* user can use Download */ }
    ta.remove();
  }

  function download() {
    var blob = new Blob([JSON.stringify({ change: change, comments: comments }, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'feedback.json';
    document.body.appendChild(a); a.click(); a.remove();
  }

  // ---------- UI (shadow DOM keeps the app's design system untouched) ----------
  var host = document.createElement('div');
  host.setAttribute('data-sdd-review', '');
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483000;pointer-events:none';
  var root = host.attachShadow({ mode: 'open' });
  root.innerHTML = '<style>' +
    ':host{all:initial}' +
    '*{box-sizing:border-box;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}' +
    '.bar{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);display:flex;gap:6px;align-items:center;' +
      'background:#0d0d0d;color:#fff;border-radius:999px;padding:6px;font-size:13px;pointer-events:auto;box-shadow:0 8px 30px rgba(0,0,0,.28)}' +
    'button{font:inherit;cursor:pointer;border:0;border-radius:999px;padding:8px 14px;background:transparent;color:inherit}' +
    '.bar button:hover{background:#2a2a2a}.bar button.on{background:#b4f372;color:#0d0d0d;font-weight:600}' +
    '.bar .sep{width:1px;height:18px;background:#3a3a3a}.bar .dot{width:7px;height:7px;border-radius:50%;margin:0 4px 0 8px;background:#b4f372}' +
    '.bar .dot.off{background:#eefb63}' +
    '.hl{position:fixed;border:2px solid #7a5fd0;background:rgba(188,154,255,.14);border-radius:4px;display:none}' +
    '.pin{position:fixed;width:24px;height:24px;margin:-10px 0 0 -10px;border-radius:50% 50% 50% 4px;background:#7a5fd0;color:#fff;' +
      'font-size:12px;font-weight:600;display:grid;place-items:center;pointer-events:auto;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.3)}' +
    '.pin.resolved{background:#8a8a8a}' +
    '.pop,.panel{position:fixed;background:#fff;color:#1b1b1b;border:1px solid #e2e2e2;border-radius:12px;pointer-events:auto;' +
      'box-shadow:0 12px 40px rgba(0,0,0,.18);font-size:13px}' +
    '.pop{width:300px;padding:12px;display:none}.pop .what{color:#6a6a6a;font-size:12px;margin-bottom:8px;word-break:break-word}' +
    'textarea{width:100%;min-height:76px;border:1px solid #e2e2e2;border-radius:8px;padding:8px;font:inherit;resize:vertical;color:#1b1b1b;background:#fff}' +
    'textarea:focus{outline:2px solid #7a5fd0;outline-offset:1px}' +
    '.row{display:flex;justify-content:flex-end;gap:6px;margin-top:8px}' +
    '.row button,.item button{border:1px solid #e2e2e2;border-radius:8px;padding:6px 10px;font-size:12px;color:#1b1b1b}' +
    '.row button.primary{background:#0d0d0d;color:#fff;border-color:#0d0d0d}' +
    '.panel{right:16px;top:16px;bottom:72px;width:320px;display:none;flex-direction:column;overflow:hidden}' +
    '.panel header{padding:12px 14px;border-bottom:1px solid #ececec;font-weight:600;display:flex;justify-content:space-between;align-items:center}' +
    '.list{overflow:auto;padding:6px}.empty{padding:18px;color:#6a6a6a}' +
    '.item{padding:10px;border-radius:8px;cursor:pointer}.item:hover{background:#f7f7f7}.item.resolved{opacity:.55}' +
    '.item .head{display:flex;gap:8px;align-items:baseline;font-weight:600;word-break:break-word}' +
    '.item .meta{color:#6a6a6a;font-size:12px;margin:2px 0 4px}.item .body{white-space:pre-wrap;word-break:break-word}' +
    '.item .acts{display:flex;gap:6px;margin-top:8px}.away{color:#a9a9a9;font-weight:400;font-size:12px}' +
    '.toast{position:fixed;left:50%;bottom:70px;transform:translateX(-50%);background:#0d0d0d;color:#fff;padding:8px 14px;border-radius:8px;font-size:13px;display:none}' +
    '</style>' +
    '<div class="hl"></div><div class="pins"></div>' +
    '<div class="pop" role="dialog" aria-label="Add comment"><div class="what"></div><textarea placeholder="What should change?"></textarea>' +
      '<div class="row"><button data-a="cancel">Cancel</button><button class="primary" data-a="save">Save</button></div></div>' +
    '<div class="panel"><header><span class="title"></span><button data-a="close">Close</button></header><div class="list"></div></div>' +
    '<div class="toast" role="status"></div>' +
    '<div class="bar" role="toolbar" aria-label="Mockup review">' +
      '<span class="dot" title=""></span>' +
      '<button data-a="mode" title="Toggle comment mode (C)">Comment</button><span class="sep"></span>' +
      '<button data-a="panel"></button><span class="sep"></span>' +
      '<button data-a="copy">Copy for agent</button><button data-a="download">Download</button></div>';

  var $ = function (s) { return root.querySelector(s); };
  var hl = $('.hl'), pins = $('.pins'), pop = $('.pop'), panel = $('.panel'), toast = $('.toast');

  function flash(msg) {
    toast.textContent = msg; toast.style.display = 'block';
    clearTimeout(flash.t); flash.t = setTimeout(function () { toast.style.display = 'none'; }, 1800);
  }

  function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }

  function render() {
    var open = comments.filter(function (c) { return c.status === 'open'; }).length;
    $('[data-a="mode"]').classList.toggle('on', commenting);
    $('[data-a="panel"]').textContent = open + ' open';
    var dot = $('.dot');
    dot.classList.toggle('off', !online);
    dot.title = online ? 'Saving to mockup/feedback.json' : 'No review server: comments stay in this browser until exported';
    $('.title').textContent = comments.length + ' comment(s) · ' + change;
    panel.style.display = panelOpen ? 'flex' : 'none';

    var list = $('.list');
    list.innerHTML = comments.length ? '' : '<div class="empty">No comments yet. Press C and click any element.</div>';
    comments.forEach(function (c, i) {
      var here = !!findTarget(c);
      var item = document.createElement('div');
      item.className = 'item' + (c.status === 'resolved' ? ' resolved' : '');
      item.innerHTML = '<div class="head"><span>' + (i + 1) + '.</span><span>' + esc(label(c.target)) +
        (here ? '' : ' <span class="away">not on this screen</span>') + '</span></div>' +
        '<div class="meta">' + esc(c.target.screen) + (c.target.state ? ' · ' + esc(c.target.state) : '') + (c.target.ac ? ' · ' + esc(c.target.ac) : '') + '</div>' +
        '<div class="body">' + esc(c.body) + '</div>' +
        '<div class="acts"><button data-act="toggle">' + (c.status === 'open' ? 'Resolve' : 'Reopen') + '</button><button data-act="delete">Delete</button></div>';
      item.addEventListener('click', function (e) {
        var act = e.target.getAttribute('data-act');
        if (act === 'toggle') { c.status = c.status === 'open' ? 'resolved' : 'open'; save({ op: 'status', id: c.id, status: c.status }); render(); }
        else if (act === 'delete') { comments.splice(comments.indexOf(c), 1); save({ op: 'delete', id: c.id }); render(); }
        else { var el = findTarget(c); if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
      });
      list.appendChild(item);
    });
    placePins();
  }

  function placePins() {
    pins.innerHTML = '';
    comments.forEach(function (c, i) {
      var el = findTarget(c);
      if (!el) return;
      var r = el.getBoundingClientRect();
      var pin = document.createElement('div');
      pin.className = 'pin' + (c.status === 'resolved' ? ' resolved' : '');
      pin.style.left = Math.max(r.left, 12) + 'px';
      pin.style.top = Math.max(r.top, 12) + 'px';
      pin.textContent = i + 1;
      pin.title = c.body;
      pin.addEventListener('click', function () { panelOpen = true; render(); });
      pins.appendChild(pin);
    });
  }

  function openDraft(el) {
    draftTarget = describe(el);
    var r = el.getBoundingClientRect();
    $('.what').textContent = label(draftTarget) + (draftTarget.text ? ' · "' + draftTarget.text + '"' : '');
    pop.style.display = 'block';
    pop.style.left = Math.max(8, Math.min(r.left, innerWidth - 316)) + 'px';
    pop.style.top = Math.max(8, Math.min(r.bottom + 8, innerHeight - 190)) + 'px';
    var ta = pop.querySelector('textarea'); ta.value = ''; ta.focus();
  }

  function closeDraft() { pop.style.display = 'none'; draftTarget = null; }

  function saveDraft() {
    var body = pop.querySelector('textarea').value.trim();
    if (!body || !draftTarget) return closeDraft();
    var added = {
      id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      status: 'open',
      body: body,
      target: draftTarget,
      url: location.pathname + location.search + location.hash,
      viewport: innerWidth + 'x' + innerHeight,
      createdAt: new Date().toISOString()
    };
    comments.push(added);
    closeDraft(); save({ op: 'add', comment: added }); render();
  }

  function setMode(on) {
    commenting = on; hl.style.display = 'none';
    document.documentElement.style.cursor = on ? 'crosshair' : '';
    if (!on) closeDraft();
    render();
  }

  root.addEventListener('click', function (e) {
    var a = e.target.getAttribute && e.target.getAttribute('data-a');
    if (a === 'mode') setMode(!commenting);
    else if (a === 'panel') { panelOpen = !panelOpen; render(); }
    else if (a === 'close') { panelOpen = false; render(); }
    else if (a === 'copy') copyForAgent();
    else if (a === 'download') download();
    else if (a === 'save') saveDraft();
    else if (a === 'cancel') closeDraft();
  });
  pop.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') saveDraft();
    e.stopPropagation();
  });

  function isOurs(e) { return e.composedPath && e.composedPath().indexOf(host) !== -1; }

  document.addEventListener('mousemove', function (e) {
    if (!commenting || isOurs(e) || draftTarget) return;
    var r = e.target.getBoundingClientRect();
    hl.style.display = 'block';
    hl.style.left = r.left + 'px'; hl.style.top = r.top + 'px';
    hl.style.width = r.width + 'px'; hl.style.height = r.height + 'px';
  }, true);

  // Capture phase: in comment mode a click never reaches the mockup's own handlers.
  ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup'].forEach(function (type) {
    document.addEventListener(type, function (e) {
      if (!commenting || isOurs(e)) return;
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      if (type === 'click') openDraft(e.target);
    }, true);
  });

  document.addEventListener('keydown', function (e) {
    if (isOurs(e)) return;
    var typing = /^(input|textarea|select)$/i.test(e.target.tagName) || e.target.isContentEditable;
    if (e.key === 'Escape' && commenting) setMode(false);
    else if ((e.key === 'c' || e.key === 'C') && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) setMode(!commenting);
  });

  var raf = 0;
  function schedule() { cancelAnimationFrame(raf); raf = requestAnimationFrame(placePins); }
  addEventListener('scroll', schedule, true);
  addEventListener('resize', schedule);
  new MutationObserver(function (records) {
    for (var i = 0; i < records.length; i++) { if (!host.contains(records[i].target)) { schedule(); break; } }
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'data-sdd-state'] });

  function start() {
    document.body.appendChild(host);
    load().then(render);
    setInterval(refresh, 4000);
  }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);

  window.__sddReview = {
    change: change,
    get comments() { return comments; },
    toMarkdown: toMarkdown,
    setMode: setMode
  };
})();
