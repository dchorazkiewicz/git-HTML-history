(function () {
  "use strict";

  var root = document.getElementById("app");
  var state = {
    data: null,
    selectedPath: null,
    versionIndex: 0,
    tab: "rendered",
    query: ""
  };

  function esc(value) {
    return String(value == null ? "" : value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function fileByPath(path) {
    return state.data.files.find(function (file) { return file.path === path; });
  }

  function currentFile() {
    return fileByPath(state.selectedPath);
  }

  function currentVersion() {
    var file = currentFile();
    return file && file.versions ? file.versions[state.versionIndex] : null;
  }

  function previousVersion() {
    var file = currentFile();
    if (!file || state.versionIndex <= 0) return null;
    return file.versions[state.versionIndex - 1];
  }

  function formatDate(iso) {
    try {
      return new Intl.DateTimeFormat("pl-PL", {
        dateStyle: "medium",
        timeStyle: "short"
      }).format(new Date(iso));
    } catch (e) {
      return iso;
    }
  }

  function repoUrl(path) {
    var base = "https://github.com/dchorazkiewicz/git-HTML-history";
    return path ? base + "/" + path : base;
  }

  function chooseFile(path) {
    var file = fileByPath(path);
    if (!file) return;
    state.selectedPath = path;
    state.versionIndex = Math.max(0, file.versions.length - 1);
    state.tab = "rendered";
    render();
  }

  function chooseVersion(index) {
    var file = currentFile();
    if (!file) return;
    state.versionIndex = Math.max(0, Math.min(index, file.versions.length - 1));
    render();
  }

  function chooseTab(tab) {
    state.tab = tab;
    render();
  }

  function buildTree(files) {
    var rootNode = { dirs: {}, files: [] };
    files.forEach(function (file) {
      var parts = file.path.split("/");
      var fileName = parts.pop();
      var node = rootNode;
      parts.forEach(function (part) {
        if (!node.dirs[part]) node.dirs[part] = { dirs: {}, files: [] };
        node = node.dirs[part];
      });
      var copy = Object.assign({}, file);
      copy.fileName = fileName;
      node.files.push(copy);
    });
    return rootNode;
  }

  function renderTreeNode(node) {
    var dirNames = Object.keys(node.dirs).sort(function (a, b) {
      return a.localeCompare(b, "pl");
    });

    var dirs = dirNames.map(function (name) {
      return '<div class="tree-group">' +
        '<div class="tree-folder">' + esc(name) + '</div>' +
        '<div class="tree-children">' + renderTreeNode(node.dirs[name]) + '</div>' +
      '</div>';
    }).join("");

    var files = node.files.slice().sort(function (a, b) {
      return a.fileName.localeCompare(b.fileName, "pl");
    }).map(function (file) {
      var active = file.path === state.selectedPath ? " active" : "";
      return '<button class="file-btn' + active + '" data-file="' + esc(file.path) + '" title="' + esc(file.path) + '">' +
        '<span class="file-icon">TEX</span>' +
        '<span class="file-name">' + esc(file.fileName) + '</span>' +
        '<span class="file-count">' + file.versionCount + '</span>' +
      '</button>';
    }).join("");

    return dirs + files;
  }

  function renderSidebar() {
    var q = state.query.trim().toLocaleLowerCase("pl");
    var filtered = state.data.files.filter(function (file) {
      if (!q) return true;
      return file.path.toLocaleLowerCase("pl").indexOf(q) >= 0 ||
        file.title.toLocaleLowerCase("pl").indexOf(q) >= 0 ||
        file.historyId.toLocaleLowerCase("pl").indexOf(q) >= 0;
    });

    var tree = filtered.length
      ? renderTreeNode(buildTree(filtered))
      : '<div class="empty-state">Brak pasujących plików.</div>';

    return '<aside class="sidebar">' +
      '<div class="panel-head"><h2>Repozytorium</h2><span class="badge">' + state.data.files.length + '</span></div>' +
      '<div class="search-wrap"><input id="file-search" class="search" type="search" placeholder="Filtruj pliki…" value="' + esc(state.query) + '" autocomplete="off" /></div>' +
      '<div class="tree"><div class="tree-root-label">' + esc(state.data.repository) + '</div>' + tree + '</div>' +
    '</aside>';
  }

  function renderHistory() {
    var file = currentFile();
    if (!file) return "";

    var items = file.versions.map(function (version, index) {
      var active = index === state.versionIndex;
      return '<button class="timeline-item' + (active ? " active" : "") + '" data-version="' + index + '">' +
        '<span class="timeline-rail"><span class="timeline-dot"></span></span>' +
        '<span class="timeline-copy">' +
          '<span class="timeline-version">' +
            '<span class="' + (active ? "current" : "") + '">v' + (index + 1) + '</span>' +
            '<span>' + esc(version.shortSha) + '</span>' +
            (active ? '<span class="current">● wybrana</span>' : '') +
          '</span>' +
          '<span class="timeline-message">' + esc(version.message) + '</span>' +
          '<span class="timeline-meta">' +
            esc(formatDate(version.date)) + ' · ' +
            '<span class="stat-add">+' + version.additions + '</span> ' +
            '<span class="stat-del">−' + version.deletions + '</span>' +
          '</span>' +
        '</span>' +
      '</button>';
    }).reverse().join("");

    return '<aside class="history-panel">' +
      '<div class="panel-head"><h2>Historia pliku</h2><span class="badge">' + file.versionCount + '</span></div>' +
      '<div class="history-list">' + items + '</div>' +
    '</aside>';
  }

  function latexText(text) {
    return esc(text)
      .replaceAll("--", "—")
      .replace(/\\textit\{([^{}]+)\}/g, "<em>$1</em>")
      .replace(/\\textbf\{([^{}]+)\}/g, "<strong>$1</strong>");
  }

  function renderLatex(content) {
    var lines = content.replace(/\r\n/g, "\n").split("\n");
    var out = [];
    var paragraph = [];
    var items = [];
    var inItems = false;
    var math = [];
    var inMath = false;

    function flushParagraph() {
      if (!paragraph.length) return;
      var text = paragraph.join(" ").trim();
      if (text) out.push('<p>' + latexText(text) + '</p>');
      paragraph = [];
    }

    function flushItems() {
      if (!items.length) return;
      out.push('<ul>' + items.map(function (item) {
        return '<li>' + latexText(item) + '</li>';
      }).join("") + '</ul>');
      items = [];
    }

    lines.forEach(function (raw) {
      var line = raw.trim();

      if (inMath) {
        if (line.endsWith("\\]")) {
          math.push(line.slice(0, -2));
          out.push('<div class="math-block">\\[' + esc(math.join("\n")) + '\\]</div>');
          math = [];
          inMath = false;
        } else {
          math.push(line);
        }
        return;
      }

      if (!line) {
        flushParagraph();
        return;
      }

      if (line.startsWith("%")) return;

      if (line.startsWith("\\[")) {
        flushParagraph();
        if (line.endsWith("\\]") && line.length > 4) {
          out.push('<div class="math-block">' + esc(line) + '</div>');
        } else {
          inMath = true;
          math = [line.slice(2)];
        }
        return;
      }

      var section = line.match(/^\\section\{(.+)\}$/);
      if (section) {
        flushParagraph();
        out.push('<h1>' + latexText(section[1]) + '</h1>');
        return;
      }

      var subsection = line.match(/^\\subsection\{(.+)\}$/);
      if (subsection) {
        flushParagraph();
        out.push('<h2>' + latexText(subsection[1]) + '</h2>');
        return;
      }

      var title = line.match(/^\\title\{(.+)\}$/);
      if (title) {
        flushParagraph();
        out.push('<h1>' + latexText(title[1]) + '</h1>');
        return;
      }

      if (line === "\\begin{itemize}") {
        flushParagraph();
        inItems = true;
        return;
      }

      if (line === "\\end{itemize}") {
        inItems = false;
        flushItems();
        return;
      }

      if (inItems && line.startsWith("\\item")) {
        items.push(line.replace(/^\\item\s*/, ""));
        return;
      }

      var include = line.match(/^\\input\{(.+)\}$/);
      if (include) {
        flushParagraph();
        out.push('<div class="include-card">↳ \\input{' + esc(include[1]) + '}</div>');
        return;
      }

      if (
        /^\\(documentclass|usepackage|geometry|newcommand)\b/.test(line) ||
        line === "\\begin{document}" ||
        line === "\\end{document}" ||
        line === "\\maketitle" ||
        line === "\\tableofcontents" ||
        /^\\author\{/.test(line) ||
        /^\\date\{/.test(line)
      ) {
        flushParagraph();
        out.push('<div class="muted-note">' + esc(line) + '</div>');
        return;
      }

      paragraph.push(line);
    });

    flushParagraph();
    flushItems();
    return out.join("");
  }

  function renderSource(content) {
    return '<div class="source-wrap">' +
      content.replace(/\r\n/g, "\n").split("\n").map(function (line, index) {
        return '<div class="code-row">' +
          '<span class="line-no">' + (index + 1) + '</span>' +
          '<span class="line-code">' + (esc(line) || " ") + '</span>' +
        '</div>';
      }).join("") +
    '</div>';
  }

  function rawDiff(oldText, newText) {
    var a = oldText.replace(/\r\n/g, "\n").split("\n");
    var b = newText.replace(/\r\n/g, "\n").split("\n");
    var m = a.length;
    var n = b.length;
    var dp = Array.from({ length: m + 1 }, function () {
      return new Uint16Array(n + 1);
    });

    for (var i = m - 1; i >= 0; i--) {
      for (var j = n - 1; j >= 0; j--) {
        dp[i][j] = a[i] === b[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }

    var rows = [];
    var ai = 0;
    var bj = 0;
    var oldNo = 1;
    var newNo = 1;

    while (ai < m || bj < n) {
      if (ai < m && bj < n && a[ai] === b[bj]) {
        rows.push({
          left: a[ai], right: b[bj],
          leftNo: oldNo++, rightNo: newNo++,
          leftType: "same", rightType: "same"
        });
        ai++;
        bj++;
      } else if (bj < n && (ai === m || dp[ai][bj + 1] >= dp[ai + 1][bj])) {
        rows.push({
          left: null, right: b[bj],
          leftNo: null, rightNo: newNo++,
          leftType: "empty", rightType: "add"
        });
        bj++;
      } else {
        rows.push({
          left: a[ai], right: null,
          leftNo: oldNo++, rightNo: null,
          leftType: "del", rightType: "empty"
        });
        ai++;
      }
    }

    var paired = [];
    for (var k = 0; k < rows.length; k++) {
      var current = rows[k];
      var next = rows[k + 1];
      if (current.leftType === "del" && next && next.rightType === "add") {
        paired.push({
          left: current.left, right: next.right,
          leftNo: current.leftNo, rightNo: next.rightNo,
          leftType: "del", rightType: "add"
        });
        k++;
      } else if (current.rightType === "add" && next && next.leftType === "del") {
        paired.push({
          left: next.left, right: current.right,
          leftNo: next.leftNo, rightNo: current.rightNo,
          leftType: "del", rightType: "add"
        });
        k++;
      } else {
        paired.push(current);
      }
    }
    return paired;
  }

  function renderDiff(file, version, previous) {
    if (!previous) {
      return '<div class="diff-empty">' +
        '<strong>To jest pierwsza wersja tego pliku.</strong>' +
        'Nie ma wcześniejszej wersji, z którą można ją porównać.' +
      '</div>';
    }

    var rows = rawDiff(previous.content, version.content);
    var body = rows.map(function (row) {
      return '<div class="diff-row">' +
        '<div class="diff-cell ' + row.leftType + '">' +
          '<span class="num">' + (row.leftNo == null ? "" : row.leftNo) + '</span>' +
          '<span class="txt">' + (row.left == null ? "" : esc(row.left)) + '</span>' +
        '</div>' +
        '<div class="diff-cell ' + row.rightType + '">' +
          '<span class="num">' + (row.rightNo == null ? "" : row.rightNo) + '</span>' +
          '<span class="txt">' + (row.right == null ? "" : esc(row.right)) + '</span>' +
        '</div>' +
      '</div>';
    }).join("");

    return '<div class="diff-shell">' +
      '<div class="diff-head">' +
        '<div class="diff-side-head">starsza · <strong>v' + (version.version - 1) + '</strong> · ' + esc(previous.shortSha) + '</div>' +
        '<div class="diff-side-head">nowsza · <strong>v' + version.version + '</strong> · ' + esc(version.shortSha) + '</div>' +
      '</div>' +
      body +
    '</div>';
  }

  function renderContent() {
    var file = currentFile();
    var version = currentVersion();
    if (!file || !version) return '<div class="empty-state">Brak wersji do wyświetlenia.</div>';

    if (state.tab === "source") return renderSource(version.content);
    if (state.tab === "diff") return renderDiff(file, version, previousVersion());

    return '<article class="paper"><div class="paper-inner rendered-doc">' +
      renderLatex(version.content) +
    '</div></article>';
  }

  function renderMain() {
    var file = currentFile();
    var version = currentVersion();
    if (!file || !version) return '<main class="main"></main>';

    var pathParts = file.path.split("/");
    var breadcrumb = pathParts.map(function (part, index) {
      return '<span>' + (index ? "/ " : "") + esc(part) + '</span>';
    }).join("");

    var olderDisabled = state.versionIndex > 0 ? "" : " disabled";
    var newerDisabled = state.versionIndex < file.versions.length - 1 ? "" : " disabled";
    var previous = previousVersion();

    return '<main class="main">' +
      '<header class="file-header">' +
        '<div class="breadcrumb">' + breadcrumb + '</div>' +
        '<div class="file-title-row">' +
          '<div class="file-heading">' +
            '<h1>' + esc(file.title) + '</h1>' +
            '<p>history-id: ' + esc(file.historyId) + ' · ' + esc(file.path) + '</p>' +
          '</div>' +
          '<div class="header-actions">' +
            '<a class="icon-btn" href="' + esc(repoUrl("blob/" + version.sha + "/" + file.path)) + '" target="_blank" rel="noreferrer">źródło ↗</a>' +
            '<a class="icon-btn primary" href="' + esc(repoUrl("commit/" + version.sha)) + '" target="_blank" rel="noreferrer">commit ↗</a>' +
          '</div>' +
        '</div>' +
      '</header>' +

      '<section class="commit-strip">' +
        '<div class="commit-main">' +
          '<div class="commit-topline">' +
            '<span class="sha">' + esc(version.shortSha) + '</span>' +
            '<span class="version-chip">v' + (state.versionIndex + 1) + ' / ' + file.versionCount + '</span>' +
          '</div>' +
          '<div class="commit-message">' + esc(version.message) + '</div>' +
          '<div class="commit-meta">' +
            '<span>' + esc(formatDate(version.date)) + '</span>' +
            '<span class="stat-add">+' + version.additions + '</span>' +
            '<span class="stat-del">−' + version.deletions + '</span>' +
            '<span>' + (previous ? "diff względem v" + (version.version - 1) : "pierwsza wersja") + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="version-nav">' +
          '<button class="nav-btn" id="older"' + olderDisabled + '>← starsza</button>' +
          '<button class="nav-btn" id="newer"' + newerDisabled + '>nowsza →</button>' +
        '</div>' +
      '</section>' +

      '<nav class="tabs">' +
        '<button class="tab-btn ' + (state.tab === "rendered" ? "active" : "") + '" data-tab="rendered">Podgląd</button>' +
        '<button class="tab-btn ' + (state.tab === "diff" ? "active" : "") + '" data-tab="diff">Zmiany</button>' +
        '<button class="tab-btn ' + (state.tab === "source" ? "active" : "") + '" data-tab="source">LaTeX</button>' +
        '<span class="spacer"></span>' +
        '<span class="compare-label">←/→ przełącza wersje</span>' +
      '</nav>' +

      '<section class="content">' + renderContent() + '</section>' +
    '</main>';
  }

  function renderTopbar() {
    return '<header class="topbar">' +
      '<div class="brand">' +
        '<div class="brand-mark">GH</div>' +
        '<div class="brand-copy"><strong>Git Article History</strong><span>LaTeX evolution explorer</span></div>' +
      '</div>' +
      '<a class="repo-pill" href="' + repoUrl() + '" target="_blank" rel="noreferrer">repo <strong>' + esc(state.data.repository) + '</strong> ↗</a>' +
      '<span class="branch-pill">branch <strong>' + esc(state.data.branch) + '</strong></span>' +
      '<span class="topbar-spacer"></span>' +
      '<span class="generated-pill"><span class="dot-live"></span>build ' + esc(formatDate(state.data.generatedAt)) + '</span>' +
    '</header>';
  }

  function bindEvents() {
    document.querySelectorAll("[data-file]").forEach(function (button) {
      button.addEventListener("click", function () { chooseFile(button.dataset.file); });
    });

    document.querySelectorAll("[data-version]").forEach(function (button) {
      button.addEventListener("click", function () {
        chooseVersion(Number(button.dataset.version));
      });
    });

    document.querySelectorAll("[data-tab]").forEach(function (button) {
      button.addEventListener("click", function () { chooseTab(button.dataset.tab); });
    });

    var older = document.getElementById("older");
    var newer = document.getElementById("newer");
    if (older) older.addEventListener("click", function () { chooseVersion(state.versionIndex - 1); });
    if (newer) newer.addEventListener("click", function () { chooseVersion(state.versionIndex + 1); });

    var search = document.getElementById("file-search");
    if (search) {
      search.addEventListener("input", function (event) {
        state.query = event.target.value;
        render();
        var next = document.getElementById("file-search");
        if (next) {
          next.focus();
          next.setSelectionRange(next.value.length, next.value.length);
        }
      });
    }
  }

  function enhanceMath() {
    if (state.tab !== "rendered") return;
    var el = document.querySelector(".rendered-doc");
    if (!el || typeof window.renderMathInElement !== "function") return;
    try {
      var macros = {
        "\\vect": "\\boldsymbol{#1}"
      };

      var preambleFile = state.data.files.find(function (file) {
        return file.path === "article/preamble.tex";
      });

      if (preambleFile && preambleFile.versions && preambleFile.versions.length) {
        var preamble = preambleFile.versions[preambleFile.versions.length - 1].content;
        var macroPattern = /\\newcommand\{(\\[A-Za-z]+)\}\[1\]\{([^\n]+)\}/g;
        var match;
        while ((match = macroPattern.exec(preamble)) !== null) {
          macros[match[1]] = match[2];
        }
      }

      window.renderMathInElement(el, {
        delimiters: [
          { left: "\\[", right: "\\]", display: true },
          { left: "\\(", right: "\\)", display: false }
        ],
        macros: macros,
        throwOnError: false
      });
    } catch (e) {
      console.warn("KaTeX rendering warning:", e);
    }
  }

  function render() {
    root.innerHTML = '<div class="app-shell">' +
      renderTopbar() +
      '<div class="workspace">' +
        renderSidebar() +
        renderMain() +
        renderHistory() +
      '</div>' +
    '</div>';

    bindEvents();
    window.setTimeout(enhanceMath, 0);
  }

  async function boot() {
    try {
      var response = await fetch("./data/history.json", { cache: "no-store" });
      if (!response.ok) throw new Error("HTTP " + response.status);
      state.data = await response.json();

      if (!state.data.files || !state.data.files.length) {
        throw new Error("Generator nie znalazł żadnych plików .tex.");
      }

      var best = state.data.files.slice().sort(function (a, b) {
        return b.versionCount - a.versionCount;
      })[0];

      state.selectedPath = best.path;
      state.versionIndex = Math.max(0, best.versions.length - 1);
      render();
    } catch (error) {
      root.innerHTML = '<div class="error-card">' +
        '<strong>Nie udało się wczytać historii.</strong>' +
        '<div>Plik <code>site/data/history.json</code> powinien zostać wygenerowany przez GitHub Actions.</div>' +
        '<div style="margin-top:10px"><code>' + esc(error && error.message ? error.message : error) + '</code></div>' +
      '</div>';
    }
  }

  document.addEventListener("keydown", function (event) {
    if (!state.data) return;
    if (document.activeElement && ["INPUT", "TEXTAREA"].indexOf(document.activeElement.tagName) >= 0) return;

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      chooseVersion(state.versionIndex - 1);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      chooseVersion(state.versionIndex + 1);
    }
  });

  boot();
})();
