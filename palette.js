/* Site palette: Mono. The pages are still written in the original violet /
   cyan accent; this swaps those accent shades - in every stylesheet rule,
   inline style and SVG paint - for white and greys on the dark theme and
   black and greys on the light theme. Anything not listed is left as it is:
   app logo colours, status colours (ok / warn / error, diff lines) and the
   logo heart.

   Loaded at the end of each page's <head>, after the theme script, so the
   swap happens before first paint; content added later (nav.js, rendered
   documents, the editor) is swapped as it arrives. A theme flip reloads,
   since the swap is per palette. Prototyped on the theme-lab branch. */
(function () {
  var root = document.documentElement;
  root.setAttribute('data-palette', 'mono');
  var light = root.getAttribute('data-theme') === 'light';

  // accent shade (r,g,b) -> [on dark, on light]
  var MAP = {
    '139,124,255': ['255,255,255', '22,21,29'],      // #8b7cff  accent
    '124,108,255': ['255,255,255', '22,21,29'],      // #7c6cff
    '106,90,240':  ['235,235,238', '22,21,29'],      // #6a5af0  light-mode accent
    '91,79,240':   ['240,240,242', '22,21,29'],      // #5b4ff0
    '79,70,229':   ['255,255,255', '22,21,29'],      // #4f46e5  primary
    '67,56,202':   ['226,226,230', '52,52,60'],      // #4338ca  primary hover
    '59,51,201':   ['205,205,210', '40,40,46'],      // #3b33c9
    '111,139,255': ['212,212,216', '63,63,70'],      // #6f8bff  gradient middle
    '79,111,240':  ['212,212,216', '63,63,70'],      // #4f6ff0
    '63,208,224':  ['161,161,170', '113,113,122'],   // #3fd0e0  gradient end
    '14,159,178':  ['161,161,170', '82,82,91'],      // #0e9fb2
    '11,127,143':  ['161,161,170', '82,82,91'],      // #0b7f8f
    '169,159,255': ['228,228,231', '82,82,91'],      // #a99fff
    '169,157,255': ['228,228,231', '82,82,91'],      // #a99dff
    '201,194,255': ['236,236,238', '113,113,122'],   // #c9c2ff
    '207,200,255': ['244,244,245', '63,63,70'],      // #cfc8ff
    '217,212,255': ['228,228,231', '212,212,216'],   // #d9d4ff
    '229,225,255': ['228,228,231', '228,228,231'],   // #e5e1ff
    '239,237,255': ['244,244,245', '244,244,245'],   // #efedff
    '241,239,255': ['244,244,245', '244,244,245'],   // #f1efff
    '42,38,69':    ['39,39,42', '39,39,42'],         // #2a2645  dark violet card
    '38,33,67':    ['39,39,42', '39,39,42'],         // #262143
    '27,24,48':    ['31,31,35', '31,31,35'],         // #1b1830
    '20,19,31':    ['24,24,27', '24,24,27'],         // #14131f
  };
  var col = light ? 1 : 0;

  function hexToKey(h) {
    h = h.slice(1);
    if (h.length === 3) h = h.replace(/./g, '$&$&');
    return parseInt(h.slice(0, 2), 16) + ',' + parseInt(h.slice(2, 4), 16) + ',' + parseInt(h.slice(4, 6), 16);
  }
  function swap(v) {
    if (!v || v.indexOf('(') === -1 && v.indexOf('#') === -1) return v;
    v = v.replace(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g, function (m) {
      var to = MAP[hexToKey(m)]; return to ? 'rgb(' + to[col] + ')' : m;
    });
    return v.replace(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(,\s*[\d.]+\s*)?\)/g, function (m, r, g, b, a) {
      var to = MAP[r + ',' + g + ',' + b];
      return to ? (a ? 'rgba(' + to[col] + a + ')' : 'rgb(' + to[col] + ')') : m;
    });
  }
  function swapStyle(st) {
    for (var i = 0; i < st.length; i++) {
      var p = st[i], v = st.getPropertyValue(p), n = swap(v);
      if (n !== v) st.setProperty(p, n, st.getPropertyPriority(p));
    }
  }
  function swapRules(rules) {
    for (var i = 0; i < rules.length; i++) {
      var r = rules[i];
      if (r.style) swapStyle(r.style);
      if (r.cssRules) swapRules(r.cssRules);
    }
  }
  var done = typeof WeakSet === 'function' ? new WeakSet() : null;
  function swapSheets() {
    Array.prototype.forEach.call(document.styleSheets, function (sh) {
      if (done && done.has(sh)) return;
      try { swapRules(sh.cssRules); if (done) done.add(sh); } catch (e) { /* cross-origin (fonts) */ }
    });
  }
  var PAINT = ['fill', 'stroke', 'stop-color', 'color'];
  function swapNode(el) {
    if (el.nodeType !== 1) return;
    PAINT.forEach(function (a) {
      var v = el.getAttribute(a);
      if (v) { var n = swap(v); if (n !== v) el.setAttribute(a, n); }
    });
    if (el.getAttribute('style')) swapStyle(el.style);
  }
  function swapTree(rootEl) {
    swapNode(rootEl);
    var all = rootEl.querySelectorAll ? rootEl.querySelectorAll('[style],[fill],[stroke],[stop-color]') : [];
    for (var i = 0; i < all.length; i++) swapNode(all[i]);
  }

  swapSheets();
  new MutationObserver(function (list) {
    list.forEach(function (m) {
      if (m.type === 'attributes') swapNode(m.target);
      else m.addedNodes.forEach(function (n) { if (n.nodeType === 1) swapTree(n); });
    });
  }).observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['style', 'fill', 'stroke', 'stop-color'] });
  document.addEventListener('DOMContentLoaded', function () { swapSheets(); swapTree(document.body); });
  window.addEventListener('load', swapSheets);
  // the swap is per palette (dark or light), so a theme flip reloads into the other one
  document.addEventListener('ilovemd:theme', function () { location.reload(); });
})();
