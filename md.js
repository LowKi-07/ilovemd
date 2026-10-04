/* ilovemd's Markdown renderer, shared by the workspace (shell.html) and the
   templates page. Small and dependency-free: headings, paragraphs, lists,
   tables, fenced code, quotes, rules, and inline code, links, bold and
   strikethrough. The source is HTML-escaped first, so the result is safe to
   put in innerHTML. */
(function () {
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function inline(s) {
    return s.split(/(`[^`]+`)/).map(function (part) {
      if (part.length > 1 && part.charAt(0) === '`' && part.charAt(part.length - 1) === '`') {
        return '<code>' + part.slice(1, -1) + '</code>';
      }
      return part
        .replace(/\[([^\]]*)\]\(([^)\s]+)\)/g, function (m, t, h) {
          return /^https?:\/\//.test(h) ? '<a href="' + h + '" target="_blank" rel="noopener">' + t + '</a>' : t;
        })
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/~~([^~]+)~~/g, '<del>$1</del>');
    }).join('');
  }
  function cells(row) {
    return row.replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map(function (c) {
      return c.replace(/\\\|/g, '|').trim();
    });
  }
  function md(src) {
    var lines = esc(src).split('\n'), out = [], i = 0, list = null;
    function closeList() { if (list) { out.push('</' + list + '>'); list = null; } }
    while (i < lines.length) {
      var line = lines[i];
      if (/^\s*```/.test(line)) {
        closeList();
        var buf = []; i++;
        while (i < lines.length && !/^\s*```/.test(lines[i])) buf.push(lines[i++]);
        i++;
        out.push('<pre><code>' + buf.join('\n') + '</code></pre>');
        continue;
      }
      if (/^\s*$/.test(line)) { closeList(); i++; continue; }
      if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { closeList(); out.push('<hr>'); i++; continue; }
      var h = line.match(/^(#{1,6})\s+(.*)$/);
      if (h) { closeList(); out.push('<h' + h[1].length + '>' + inline(h[2]) + '</h' + h[1].length + '>'); i++; continue; }
      if (/^\s*\|/.test(line) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|?\s*$/.test(lines[i + 1])) {
        closeList();
        var head = cells(line.trim()); i += 2;
        var rows = [];
        while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(cells(lines[i++].trim()));
        out.push('<div class="tablewrap"><table><thead><tr>' +
          head.map(function (c) { return '<th>' + inline(c) + '</th>'; }).join('') +
          '</tr></thead><tbody>' +
          rows.map(function (r) {
            return '<tr>' + r.map(function (c) { return '<td>' + inline(c) + '</td>'; }).join('') + '</tr>';
          }).join('') + '</tbody></table></div>');
        continue;
      }
      if (/^\s*&gt;\s?/.test(line)) {
        closeList();
        var q = [];
        while (i < lines.length && /^\s*&gt;\s?/.test(lines[i])) q.push(lines[i++].replace(/^\s*&gt;\s?/, ''));
        out.push('<blockquote><p>' + inline(q.join(' ')) + '</p></blockquote>');
        continue;
      }
      var ul = line.match(/^\s*[-*+]\s+(.*)$/), ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
      if (ul || ol) {
        var want = ul ? 'ul' : 'ol';
        if (list !== want) { closeList(); out.push('<' + want + '>'); list = want; }
        out.push('<li>' + inline((ul || ol)[1]) + '</li>');
        i++;
        continue;
      }
      closeList();
      var p = [];
      while (i < lines.length && !/^\s*$/.test(lines[i]) &&
             !/^(#{1,6}\s|\s*```|\s*\||\s*&gt;|\s*[-*+]\s|\s*\d+[.)]\s)/.test(lines[i]) &&
             !/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(lines[i])) p.push(lines[i++]);
      if (p.length) out.push('<p>' + inline(p.join(' ')) + '</p>');
      else i++;
    }
    closeList();
    return out.join('\n');
  }

  window.ilovemdMarkdown = md;
})();
