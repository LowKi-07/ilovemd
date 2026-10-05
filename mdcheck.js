/* CommonMark check for generated Markdown, shared by the server (every AI
   result) and the editor (live, as you type).

   Every string is valid CommonMark - the spec says how to parse anything -
   so "valid / invalid" means nothing on its own. What this does instead is
   parse the document with markdown-it (a parser that passes the CommonMark
   spec tests, plus GFM tables) and look for the structural problems that
   actually break a Markdown document:

     error  unclosed code fence    swallows everything after it
     error  table row width        a row with more or fewer cells than its header
     error  empty document
     warn   no # title / several # titles
     warn   skipped heading level  ## straight to ####
     warn   raw HTML               pure-Markdown output was asked for
     warn   chat preamble          "Here is your document..." left in

   fix(src) closes an unclosed fence - the one problem with a single safe
   repair. Used as: ilovemdCheck.check(markdownitInstance, src). Works as a
   classic browser script and as an ES-module side-effect import in Node. */
(function (root) {
  // Fenced code blocks per CommonMark: ``` or ~~~ (3+), up to 3 spaces of
  // indent; closed by the same character at least as long, with nothing
  // after it but spaces.
  function openFence(src) {
    var lines = src.split('\n'), open = null;
    for (var i = 0; i < lines.length; i++) {
      var m = lines[i].match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
      if (!m) continue;
      if (!open) {
        if (m[1][0] === '`' && m[2].indexOf('`') !== -1) continue;   // not a fence: backticks in the info string
        open = { ch: m[1][0], len: m[1].length, line: i + 1 };
      } else if (m[1][0] === open.ch && m[1].length >= open.len && !m[2].trim()) {
        open = null;
      }
    }
    return open;
  }

  // Cells in one table row, the GFM way: split on pipes that are not
  // escaped and not inside code spans, ignoring the optional outer pipes.
  function cellCount(line) {
    var s = line.trim().replace(/^\|/, '').replace(/\|$/, ''), n = 1, inCode = false;
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (c === '\\') { i++; continue; }
      if (c === '`') inCode = !inCode;
      else if (c === '|' && !inCode) n++;
    }
    return n;
  }

  function check(md, src) {
    src = String(src == null ? '' : src).replace(/\r\n?/g, '\n');
    var issues = [];
    // code + data say what the problem is, so fixIssue() can repair it.
    function add(level, line, msg, code, data) { issues.push({ level: level, line: line, msg: msg, code: code || '', data: data || {} }); }

    if (!src.trim()) {
      add('error', 0, 'The document is empty.', 'empty');
      return { ok: false, issues: issues };
    }
    var fence = openFence(src);
    if (fence) add('error', fence.line, 'Code fence opened on line ' + fence.line + ' is never closed - everything after it renders as code.', 'fence-open');

    var lines = src.split('\n');
    var tokens = md.parse(src, {});
    var h1 = 0, prev = 0, h1Lines = [];
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i], line = t.map ? t.map[0] + 1 : 0;
      if (t.type === 'heading_open') {
        var level = Number(t.tag.slice(1));
        if (level === 1) { h1++; h1Lines.push(line); }
        if (prev && level > prev + 1) add('warn', line, 'Heading on line ' + line + ' jumps from H' + prev + ' to H' + level + '.', 'heading-skip', { to: prev + 1 });
        prev = level;
      } else if (t.type === 'table_open' && t.map) {
        var want = cellCount(lines[t.map[0]]);
        for (var r = t.map[0] + 2; r < t.map[1]; r++) {
          if (!lines[r] || !lines[r].trim()) continue;
          var got = cellCount(lines[r]);
          if (got !== want) add('error', r + 1, 'Table row on line ' + (r + 1) + ' has ' + got + ' cell' + (got === 1 ? '' : 's') + '; its header has ' + want + '.', 'table-cells', { want: want, got: got });
        }
      } else if (t.type === 'html_block') {
        add('warn', line, 'Raw HTML on line ' + line + ' - not plain Markdown.', 'html');
      } else if (t.type === 'inline' && t.children) {
        for (var k = 0; k < t.children.length; k++) {
          if (t.children[k].type === 'html_inline') { add('warn', line, 'Inline HTML on line ' + line + ' - not plain Markdown.', 'html'); break; }
        }
      }
    }
    if (h1 === 0) add('warn', 0, 'No # title - the document should open with one.', 'no-title');
    // The first # stays the title; each later one is flagged on its own line.
    for (var e = 1; e < h1Lines.length; e++) {
      add('warn', h1Lines[e], 'A second # title on line ' + h1Lines[e] + ' - a document should have one.', 'h1-extra');
    }
    if (/^(here is|here's|sure[,!]|certainly|of course|i cannot|i can't)/i.test(src.trim())) {
      add('warn', 1, 'Starts with a chat reply instead of the document.', 'preamble');
    }
    return {
      ok: !issues.some(function (x) { return x.level === 'error'; }),
      issues: issues,
    };
  }

  // The one safe automatic repair: close a fence left open at the end.
  function fix(src) {
    src = String(src == null ? '' : src);
    var fence = openFence(src.replace(/\r\n?/g, '\n'));
    if (!fence) return { text: src, fixed: [] };
    var close = new Array(fence.len + 1).join(fence.ch);
    return { text: src.replace(/\s*$/, '') + '\n' + close + '\n', fixed: ['Closed the code fence opened on line ' + fence.line + '.'] };
  }

  /* The repair for one issue, as an edit { start, end, text } on src (char
     offsets) - or null when the right fix needs judgement (raw HTML, a row
     with too many cells), which callers hand to the AI instead. */
  function fixIssue(src, issue) {
    src = String(src == null ? '' : src);
    var lines = src.split('\n');
    function lineStart(n) { var o = 0; for (var i = 0; i < n - 1; i++) o += lines[i].length + 1; return o; }
    function replaceLine(n, text) { var st = lineStart(n); return { start: st, end: st + lines[n - 1].length, text: text }; }
    var n = issue.line, line = n > 0 ? lines[n - 1] : null;
    switch (issue.code) {
      case 'fence-open': {
        var f = openFence(src.replace(/\r\n?/g, '\n'));
        if (!f) return null;
        var tail = src.match(/\s*$/)[0].length;
        return { start: src.length - tail, end: src.length, text: '\n' + new Array(f.len + 1).join(f.ch) + '\n' };
      }
      case 'heading-skip':
        if (line == null) return null;
        return replaceLine(n, line.replace(/^(\s{0,3})#{1,6}/, '$1' + new Array(issue.data.to + 1).join('#')));
      case 'h1-extra':
        if (line == null) return null;
        return replaceLine(n, line.replace(/^(\s{0,3})#(?=\s)/, '$1##'));
      case 'table-cells': {
        if (line == null || issue.data.got > issue.data.want) return null;
        var r = line.replace(/\s+$/, ''), open = /\|$/.test(r) && !/\\\|$/.test(r);
        return replaceLine(n, (open ? r : r + ' |') + new Array(issue.data.want - issue.data.got + 1).join('  |'));
      }
      case 'preamble': {
        // The chat reply runs up to the first blank line or heading.
        var end = 0;
        while (end < lines.length && lines[end].trim() && !/^#{1,6}\s/.test(lines[end])) end++;
        while (end < lines.length && !lines[end].trim()) end++;
        return { start: 0, end: lineStart(end + 1), text: '' };
      }
      default:
        return null;
    }
  }

  root.ilovemdCheck = { check: check, fix: fix, fixIssue: fixIssue };
})(typeof globalThis !== 'undefined' ? globalThis : this);
