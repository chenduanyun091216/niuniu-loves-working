const SQL_KEYWORDS = new Set("ADD ALL ALTER AND ANY AS ASC BETWEEN BY CASE CAST COLLATE COLUMN COMMIT CONSTRAINT CREATE CROSS CURRENT_DATE CURRENT_TIME CURRENT_TIMESTAMP DATABASE DEFAULT DELETE DESC DISTINCT DROP ELSE END EXCEPT EXISTS FALSE FETCH FIRST FOR FOREIGN FROM FULL GRANT GROUP HAVING IN INDEX INNER INSERT INTERSECT INTO IS JOIN KEY LEFT LIKE LIMIT NOT NULL OFFSET ON OR ORDER OUTER PRIMARY REFERENCES RETURNING RIGHT ROLLBACK ROW SELECT SET TABLE THEN TRUE UNION UNIQUE UPDATE USING VALUES WHEN WHERE WITH".split(" "));
const JSON_TOKEN_PATTERN = /("(?:\\.|[^"\\])*"(?=\s*:))|("(?:\\.|[^"\\])*")|(-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false)\b|\b(null)\b|([{}\[\],:])|(\s+)|([\s\S])/gy;

export function createCodeView(text, isJson = false) {
  const pre = document.createElement("pre");
  pre.className = "code-view";
  if (!isJson) {
    pre.textContent = text;
    return pre;
  }

  JSON_TOKEN_PATTERN.lastIndex = 0;
  for (const match of text.matchAll(JSON_TOKEN_PATTERN)) {
    const tokenClass = match[1] ? "json-key"
      : match[2] ? "json-string"
        : match[3] ? "json-number"
          : match[4] ? "json-boolean"
            : match[5] ? "json-null"
              : "";
    if (!tokenClass) {
      pre.append(document.createTextNode(match[0]));
      continue;
    }
    const token = document.createElement("span");
    token.className = tokenClass;
    token.textContent = match[0];
    pre.append(token);
  }
  return pre;
}

export function highlightResponseMatches(container, term) {
  const query = term.trim();
  if (!query) return 0;

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  const text = nodes.map((node) => node.nodeValue).join("");
  const pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "giu");
  const matches = [...text.matchAll(pattern)].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
  }));

  // Match the full text, then mark each intersecting token without losing its syntax style.
  let nodeStart = 0;
  let matchIndex = 0;
  for (const node of nodes) {
    const value = node.nodeValue;
    const nodeEnd = nodeStart + value.length;
    while (matches[matchIndex]?.end <= nodeStart) matchIndex += 1;
    if (matches[matchIndex]?.start < nodeEnd) {
      const fragment = document.createDocumentFragment();
      let offset = 0;
      for (let index = matchIndex; matches[index]?.start < nodeEnd; index += 1) {
        const start = Math.max(0, matches[index].start - nodeStart);
        const end = Math.min(value.length, matches[index].end - nodeStart);
        fragment.append(document.createTextNode(value.slice(offset, start)));
        const mark = document.createElement("mark");
        mark.className = "response-match";
        mark.textContent = value.slice(start, end);
        fragment.append(mark);
        offset = end;
      }
      fragment.append(document.createTextNode(value.slice(offset)));
      node.replaceWith(fragment);
    }
    nodeStart = nodeEnd;
  }
  return matches.length;
}

export function formatRawJson(text) {
  try {
    return { text: JSON.stringify(JSON.parse(text), null, 2), isJson: true };
  } catch {
    return { text, isJson: false };
  }
}

export function addSection(container, title) {
  const section = document.createElement("section");
  section.className = "detail-section";
  const heading = document.createElement("h2");
  heading.className = "section-title";
  heading.textContent = title;
  section.append(heading);
  container.append(section);
  return section;
}

export function addRows(container, rows) {
  const list = document.createElement("div");
  list.className = "kv-list";
  for (const [key, value] of rows) {
    const row = document.createElement("div");
    row.className = "kv-row";
    const name = document.createElement("span");
    name.className = "kv-key";
    name.textContent = key;
    const content = document.createElement("span");
    content.className = "kv-value";
    content.textContent = value !== null && typeof value === "object"
      ? JSON.stringify(value, null, 2)
      : String(value ?? "");
    row.append(name, content);
    list.append(row);
  }
  container.append(list);
}

export function createNote(text) {
  const note = document.createElement("div");
  note.className = "empty-note";
  if (!text) {
    note.textContent = text;
    return note;
  }
  const isLoading = /^正在/.test(text);
  const isError = /无法|错误|失败|超时|不支持|禁止/.test(text);
  note.classList.add(isLoading ? "loading" : isError ? "error" : "empty");
  const icon = document.createElement("span");
  icon.className = "empty-note-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = isLoading ? "◌" : isError ? "!" : "—";
  const message = document.createElement("span");
  message.textContent = text;
  note.append(icon, message);
  return note;
}

export function setButtonLabel(button, icon, label) {
  const iconElement = document.createElement("span");
  iconElement.className = "button-icon";
  iconElement.setAttribute("aria-hidden", "true");
  iconElement.textContent = icon;
  button.replaceChildren(iconElement, document.createTextNode(label));
}

function previewPrimitive(value) {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  return String(value);
}

function previewValue(value) {
  if (Array.isArray(value)) return value.length ? "[…]" : "[]";
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value);
    const preview = entries.slice(0, 5).map(([name, item]) => [
      `${name}: `,
      item !== null && typeof item === "object"
        ? previewValue(item)
        : previewPrimitive(item),
    ].join(""));
    if (entries.length > 5) preview.push("…");
    return `{${preview.join(", ")}}`;
  }
  return previewPrimitive(value);
}

export function renderPreviewValue(value, key, depth = 0) {
  if (value !== null && typeof value === "object") {
    const entries = Array.isArray(value)
      ? value.map((item, index) => [String(index), item])
      : Object.entries(value);
    const details = document.createElement("details");
    details.open = depth === 0 || (depth === 1 && Array.isArray(value));
    const summary = document.createElement("summary");
    summary.textContent = key === null ? previewValue(value) : `${key}: ${previewValue(value)}`;
    details.append(summary);

    if (depth >= 16) {
      const leaf = document.createElement("div");
      leaf.className = "tree-leaf";
      leaf.textContent = JSON.stringify(value);
      details.append(leaf);
      return details;
    }

    for (const [childKey, childValue] of entries) {
      details.append(renderPreviewValue(childValue, childKey, depth + 1));
    }
    return details;
  }

  const row = document.createElement("div");
  row.className = "tree-leaf";
  if (key !== null) {
    const name = document.createElement("span");
    name.className = "tree-key";
    name.textContent = `${key}: `;
    row.append(name);
  }
  const content = document.createElement("span");
  const type = value === null ? "null" : typeof value;
  content.className = `tree-value ${type}`;
  content.textContent = value === null ? "null" : typeof value === "string" ? JSON.stringify(value) : String(value);
  row.append(content);
  return row;
}

export function renderBinaryPreview(record, decoded) {
  const source = `data:${decoded.mimeType};base64,${record.bodyBase64}`;
  const container = document.createElement("div");
  container.className = "binary-preview";

  if (decoded.mimeType.startsWith("image/")) {
    const image = document.createElement("img");
    image.src = source;
    image.alt = `${decoded.mimeType} 响应预览`;
    container.append(image);
  } else if (decoded.mimeType.startsWith("audio/")) {
    const audio = document.createElement("audio");
    audio.controls = true;
    audio.src = source;
    container.append(audio);
  } else if (decoded.mimeType.startsWith("video/")) {
    const video = document.createElement("video");
    video.controls = true;
    video.src = source;
    container.append(video);
  } else if (decoded.mimeType === "application/pdf") {
    const frame = document.createElement("iframe");
    frame.title = "PDF 响应预览";
    frame.src = source;
    container.append(frame);
  } else {
    container.append(createNote(`${decoded.mimeType} 是二进制响应，Chrome 在 Preview 中提供文件预览。`));
  }

  return container;
}

export function createSqlView(sql) {
  const fragment = document.createDocumentFragment();
  const tokens = /(\/\*[\s\S]*?\*\/|--[^\r\n]*|(?:'(?:''|\\.|[^'\\])*'|"(?:""|\\.|[^"\\])*"|`(?:``|[^`])*`)|\b\d+(?:\.\d+)?\b|[A-Za-z_][A-Za-z0-9_$]*|<=|>=|<>|!=|:=|[-+*/%=<>])/g;
  let offset = 0;
  for (const match of sql.matchAll(tokens)) {
    if (match.index > offset) fragment.append(document.createTextNode(sql.slice(offset, match.index)));
    const token = match[0];
    const span = document.createElement("span");
    const upper = token.toUpperCase();
    span.className = token.startsWith("--") || token.startsWith("/*") ? "sql-comment"
      : token.startsWith("'") ? "sql-string"
        : /^\d/.test(token) ? "sql-number"
          : SQL_KEYWORDS.has(upper) ? "sql-keyword"
            : /^["`A-Za-z_]/.test(token) ? "sql-identifier"
              : "sql-operator";
    span.textContent = token;
    fragment.append(span);
    offset = match.index + token.length;
  }
  if (offset < sql.length) fragment.append(document.createTextNode(sql.slice(offset)));
  const view = document.createElement("pre");
  view.className = "code-view";
  view.append(fragment);
  return view;
}
