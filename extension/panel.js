import { DEFAULT_AES_KEY, DEFAULT_ENCRYPTION_METHOD, getEncryptionMethod } from "./crypto.js";
import { decodeDataValue, decodeResponse } from "./response-utils.js";
import { extractSql } from "./sql-utils.js";

const requestList = document.getElementById("request-list");
const requestCount = document.getElementById("request-count");
const searchInput = document.getElementById("request-search");
const workspace = document.querySelector(".workspace");
const requestSidebar = document.querySelector(".request-sidebar");
const resizeDivider = document.getElementById("resize-divider");
const detailsEmpty = document.getElementById("details-empty");
const detailsView = document.getElementById("details-view");
const detailContent = document.getElementById("detail-content");
const responseSearch = document.getElementById("response-search");
const responseSearchInput = document.getElementById("response-search-input");
const responseSearchCount = document.getElementById("response-search-count");
const responseSearchClear = document.getElementById("response-search-clear");
const clearRequestsButton = document.getElementById("clear-requests");
const openSettingsButton = document.getElementById("open-settings");
const detailTabs = document.querySelector(".detail-tabs");
const detailTabButtons = [...detailTabs.querySelectorAll("button")];
const detailMethod = document.getElementById("detail-method");
const detailUrl = document.getElementById("detail-url");
const detailStatus = document.getElementById("detail-status");
const detailDuration = document.getElementById("detail-duration");
const responseState = document.getElementById("response-state");
const records = [];
let selectedId = null;
let activeTab = "headers";
let responseSearchTerm = "";
let nextId = 1;
const SQL_KEYWORDS = new Set("ADD ALL ALTER AND ANY AS ASC BETWEEN BY CASE CAST COLLATE COLUMN COMMIT CONSTRAINT CREATE CROSS CURRENT_DATE CURRENT_TIME CURRENT_TIMESTAMP DATABASE DEFAULT DELETE DESC DISTINCT DROP ELSE END EXCEPT EXISTS FALSE FETCH FIRST FOR FOREIGN FROM FULL GRANT GROUP HAVING IN INDEX INNER INSERT INTERSECT INTO IS JOIN KEY LEFT LIKE LIMIT NOT NULL OFFSET ON OR ORDER OUTER PRIMARY REFERENCES RETURNING RIGHT ROLLBACK ROW SELECT SET TABLE THEN TRUE UNION UNIQUE UPDATE USING VALUES WHEN WHERE WITH".split(" "));
const AES_KEY_STORAGE_KEY = "niuniu-aes-key";
const ENCRYPTION_METHOD_STORAGE_KEY = "niuniu-encryption-method";
const THEME_STORAGE_KEY = "niuniu-theme";
const settingsDialog = document.getElementById("settings-dialog");
const settingsForm = document.getElementById("settings-form");
const settingsMethod = document.getElementById("encryption-method");
const settingsKey = document.getElementById("aes-key");
const themeSelect = document.getElementById("theme-select");
const settingsHint = document.querySelector(".settings-hint");
const settingsError = document.getElementById("settings-error");
const cancelSettingsButton = document.getElementById("cancel-settings");
const resetDefaultKeyButton = document.getElementById("reset-default-key");
const rawModeToggle = document.getElementById("raw-mode-toggle");
let rawMode = false;
const JSON_TOKEN_PATTERN = /("(?:\\.|[^"\\])*"(?=\s*:))|("(?:\\.|[^"\\])*")|(-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false)\b|\b(null)\b|([{}\[\],:])|(\s+)|([\s\S])/gy;

function configuredAesKey() {
  try {
    return localStorage.getItem(AES_KEY_STORAGE_KEY) || DEFAULT_AES_KEY;
  } catch {
    return DEFAULT_AES_KEY;
  }
}

function configuredEncryptionMethod() {
  try {
    const savedMethod = localStorage.getItem(ENCRYPTION_METHOD_STORAGE_KEY);
    return getEncryptionMethod(savedMethod || DEFAULT_ENCRYPTION_METHOD).value;
  } catch {
    return DEFAULT_ENCRYPTION_METHOD;
  }
}

function updateEncryptionSettings() {
  const config = getEncryptionMethod(settingsMethod.value);
  const requiresKey = config.keyLengths.length > 0;
  settingsKey.disabled = !requiresKey;
  settingsKey.required = requiresKey;
  settingsHint.textContent = requiresKey
    ? `${config.label}：密钥和主题只保存在此扩展的本地配置中。密钥 UTF-8 长度需为 ${config.keyLengths.join("、")} 字节。`
    : "Base64 不需要密钥。主题和解密方式只保存在此扩展的本地配置中。";
}

function configuredTheme() {
  try {
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    if (savedTheme === "light" || savedTheme === "dark") return savedTheme;
  } catch {
    // Fall back to the system theme when local storage is unavailable.
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
}

applyTheme(configuredTheme());

function responseMimeType(entry) {
  const contentType = entry.response?.content?.mimeType || "";
  return (responseHeader(entry, "content-type") || contentType).toLowerCase();
}

function responseHeader(entry, name) {
  return entry.response?.headers?.find((item) => (item.name || "").toLowerCase() === name)?.value || "";
}

function responseEncryption(entry) {
  return responseHeader(entry, "x-data-encrypted").trim().toUpperCase();
}

function isApiRequest(entry) {
  const type = String(entry._resourceType || entry.type || "").toLowerCase();
  if (type === "xhr" || type === "fetch") return true;
  if (["document", "stylesheet", "script", "image", "font", "media", "websocket", "ping", "preflight"].includes(type)) {
    return false;
  }
  const method = String(entry.request?.method || "GET").toUpperCase();
  const accept = entry.request?.headers?.find((item) => (item.name || "").toLowerCase() === "accept")?.value || "";
  return method !== "GET" || /json|graphql/.test(responseMimeType(entry)) || /json|graphql/i.test(accept);
}

function createRecord(entry) {
  const record = {
    id: nextId++,
    entry,
    bodyText: null,
    bodyError: "",
    bodyReady: false,
    decoded: null,
  };
  records.unshift(record);

  selectedId ??= record.id;
  return record;
}

function clearRecords() {
  records.length = 0;
  selectedId = null;
  renderList();
  renderDetails();
}

function invalidateDecodedRecords() {
  for (const record of records) record.decoded = null;
}

function decodeContent(content, encoding) {
  if (typeof content !== "string") return "";
  if (encoding !== "base64") return content;

  const binary = atob(content);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function setResponseContent(record, content, encoding) {
  if (content && typeof content === "object") {
    encoding = content.encoding || "";
    content = content.content;
  }

  try {
    record.bodyText = decodeContent(content, encoding);
    record.bodyReady = true;
    record.bodyError = "";
    record.decoded = null;
  } catch {
    record.bodyText = "";
    record.bodyReady = true;
    record.bodyError = "响应内容不是可显示的文本。";
  }

  if (record.id === selectedId) renderDetails();
}

function setBodyError(record, message) {
  record.bodyText = "";
  record.bodyReady = true;
  record.bodyError = message;
  if (record.id === selectedId) renderDetails();
}

function loadLiveContent(record, request) {
  if (typeof request.getContent !== "function") {
    setBodyError(record, "无法读取响应正文。");
    return;
  }

  try {
    request.getContent((content, encoding) => setResponseContent(record, content, encoding));
  } catch {
    setBodyError(record, "无法读取响应正文。");
  }
}

function requestName(url) {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    return `${segments[segments.length - 1] || parsed.host}${parsed.search}`;
  } catch {
    return url;
  }
}

function isExplainRequest(url) {
  try {
    return new URL(url).searchParams.get("isExplain") === "true";
  } catch {
    return false;
  }
}

function hasJsonResponse(entry) {
  const mimeType = responseMimeType(entry);
  return !mimeType || /json|graphql/.test(mimeType);
}

function renderList() {
  const query = searchInput.value.trim().toLowerCase();
  const filtered = records.filter((record) => {
    const request = record.entry.request;
    return `${request.method || "GET"} ${request.url}`.toLowerCase().includes(query);
  });

  requestCount.textContent = `${records.length} 个请求`;
  requestList.replaceChildren();

  if (!filtered.length) {
    const empty = document.createElement("div");
    empty.className = "list-empty";
    empty.textContent = records.length ? "没有匹配的接口" : "暂无接口请求，刷新页面试试";
    requestList.append(empty);
    return;
  }

  for (const record of filtered) {
    const request = record.entry.request;
    const row = document.createElement("button");
    row.type = "button";
    row.className = `request-row${record.id === selectedId ? " selected" : ""}`;
    row.dataset.id = String(record.id);
    row.setAttribute("role", "option");
    row.setAttribute("aria-selected", String(record.id === selectedId));

    const icon = document.createElement("span");
    const jsonResponse = hasJsonResponse(record.entry);
    const explainRequest = isExplainRequest(request.url);
    icon.className = `request-type-icon${explainRequest ? " explain" : jsonResponse ? " json" : " text"}`;
    icon.textContent = explainRequest ? "SQL" : jsonResponse ? "{}" : "<>";
    icon.title = explainRequest ? "SQL 解释请求" : jsonResponse ? "JSON" : "文本";
    icon.setAttribute("aria-hidden", "true");
    const name = document.createElement("span");
    name.className = "request-name";
    name.textContent = requestName(request.url);
    name.title = request.url;
    row.append(icon, name);
    requestList.append(row);
  }
}

function applySidebarWidth(width) {
  const workspaceWidth = workspace.getBoundingClientRect().width;
  const dividerWidth = resizeDivider.getBoundingClientRect().width || 5;
  const maxWidth = Math.max(0, workspaceWidth - 250 - dividerWidth);
  const minWidth = Math.min(180, maxWidth);
  const nextWidth = Math.min(maxWidth, Math.max(minWidth, width));
  workspace.style.setProperty("--sidebar-width", `${Math.round(nextWidth)}px`);
  resizeDivider.setAttribute("aria-valuemin", String(Math.round(minWidth)));
  resizeDivider.setAttribute("aria-valuemax", String(Math.round(maxWidth)));
  resizeDivider.setAttribute("aria-valuenow", String(Math.round(nextWidth)));
}

function createCodeView(text, isJson = false) {
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

function highlightResponseMatches(container, term) {
  const normalizedTerm = term.trim().toLocaleLowerCase();
  if (!normalizedTerm) return 0;

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);

  let matchCount = 0;
  for (const textNode of textNodes) {
    const text = textNode.nodeValue;
    const lowerText = text.toLocaleLowerCase();
    let offset = 0;
    const fragment = document.createDocumentFragment();
    let matchIndex = lowerText.indexOf(normalizedTerm, offset);
    if (matchIndex < 0) continue;

    while (matchIndex >= 0) {
      if (matchIndex > offset) fragment.append(document.createTextNode(text.slice(offset, matchIndex)));
      const mark = document.createElement("mark");
      mark.className = "response-match";
      mark.textContent = text.slice(matchIndex, matchIndex + normalizedTerm.length);
      fragment.append(mark);
      matchCount += 1;
      offset = matchIndex + normalizedTerm.length;
      matchIndex = lowerText.indexOf(normalizedTerm, offset);
    }
    if (offset < text.length) fragment.append(document.createTextNode(text.slice(offset)));
    textNode.replaceWith(fragment);
  }
  return matchCount;
}

function formatRawJson(text) {
  try {
    return { text: JSON.stringify(JSON.parse(text), null, 2), isJson: true };
  } catch {
    return { text, isJson: false };
  }
}

function renderDecodedRequestBody(text, key, method) {
  const decoded = decodeResponse(text, key, { method });
  const decodedText = decoded.isJson ? JSON.stringify(decoded.value, null, 2) : decoded.text;
  if (decodedText === text) return null;

  const section = document.createElement("section");
  section.className = "detail-section";
  const heading = document.createElement("h2");
  heading.className = "section-title";
  heading.textContent = "Decoded Request Body";
  section.append(heading, createCodeView(decodedText, decoded.isJson));
  return section;
}

function addSection(container, title) {
  const section = document.createElement("section");
  section.className = "detail-section";
  const heading = document.createElement("h2");
  heading.className = "section-title";
  heading.textContent = title;
  section.append(heading);
  container.append(section);
  return section;
}

function addRows(container, rows) {
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

function renderHeaders(record) {
  const entry = record.entry;
  const general = addSection(detailContent, "General");
  addRows(general, [
    ["Request URL", entry.request.url],
    ["Request Method", entry.request.method],
    ["Status Code", `${entry.response.status || 0} ${entry.response.statusText || ""}`.trim()],
    ["Content Type", responseMimeType(entry) || "—"],
  ]);

  for (const [title, headers] of [["Response Headers", entry.response.headers], ["Request Headers", entry.request.headers]]) {
    const section = addSection(detailContent, title);
    if (headers?.length) addRows(section, headers.map((header) => [header.name, header.value]));
    else section.append(createNote("无 Header 信息"));
  }
}

function renderPayload(record) {
  let url;
  try {
    url = new URL(record.entry.request.url);
  } catch {
    detailContent.append(createNote("无法解析此请求的 URL。"));
    return;
  }
  const queryEntries = [...url.searchParams.entries()];
  const postData = record.entry.request.postData;
  const key = configuredAesKey();
  const method = configuredEncryptionMethod();

  if (rawMode && url.search) {
    const section = addSection(detailContent, "Raw Query String");
    section.append(createCodeView(url.search.slice(1)));
  } else if (queryEntries.length) {
    const section = addSection(detailContent, "Query String Parameters");
    addRows(section, queryEntries.map(([name, value]) => [
      name,
      decodeDataValue(value, key, { method }).value,
    ]));
  }

  if (rawMode && typeof postData?.text === "string") {
    const section = addSection(detailContent, "Raw Request Body");
    const rawBody = formatRawJson(postData.text);
    section.append(createCodeView(rawBody.text, rawBody.isJson));
    const decodedSection = renderDecodedRequestBody(postData.text, key, method);
    if (decodedSection) detailContent.append(decodedSection);
  } else if (postData?.params?.length) {
    const section = addSection(detailContent, "Form Data");
    addRows(section, postData.params.map((item) => [
      item.name,
      rawMode ? item.value || "(binary)" : decodeDataValue(item.value || "(binary)", key, { method }).value,
    ]));
  } else if (typeof postData?.text === "string") {
    const section = addSection(detailContent, "Request Payload");
    const decoded = decodeResponse(postData.text, key, { method });
    const text = decoded.isJson ? JSON.stringify(decoded.value, null, 2) : decoded.text;
    section.append(createCodeView(text, decoded.isJson));
  }

  if (!url.search && !postData) detailContent.append(createNote("此请求没有 Payload"));
}

function createNote(text) {
  const note = document.createElement("div");
  note.className = "empty-note";
  note.textContent = text;
  return note;
}

function setButtonLabel(button, icon, label) {
  const iconElement = document.createElement("span");
  iconElement.className = "button-icon";
  iconElement.setAttribute("aria-hidden", "true");
  iconElement.textContent = icon;
  button.replaceChildren(iconElement, document.createTextNode(label));
}

function responseFor(record) {
  if (record.bodyError) return null;
  if (!record.bodyReady) return null;
  if (rawMode) {
    const text = record.bodyText || "";
    try {
      return { value: JSON.parse(text), text, isJson: true, decrypted: false, label: "原始响应" };
    } catch {
      return { value: text, text, isJson: false, decrypted: false, label: "原始响应" };
    }
  }
  record.decoded ??= decodeResponse(record.bodyText || "", configuredAesKey(), {
    method: configuredEncryptionMethod(),
    encryption: responseEncryption(record.entry),
  });
  return record.decoded;
}

function renderResponseState(record) {
  const decoded = responseFor(record);
  responseState.textContent = record.bodyError || (decoded ? decoded.label : "正在读取响应");
  responseState.classList.toggle("decrypted", Boolean(decoded?.decrypted));
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

function renderPreviewValue(value, key, depth = 0) {
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

function renderBodyTab(record, tab) {
  if (record.bodyError) {
    detailContent.append(createNote(record.bodyError));
    return;
  }
  if (!record.bodyReady) {
    detailContent.append(createNote("正在读取响应正文…"));
    return;
  }
  if (!record.bodyText) {
    detailContent.append(createNote("此接口没有响应正文"));
    return;
  }

  const decoded = responseFor(record);
  if (tab === "preview") {
    if (!decoded.isJson) {
      const codeView = createCodeView(decoded.text);
      detailContent.append(codeView);
      const matchCount = highlightResponseMatches(codeView, responseSearchTerm);
      responseSearchCount.textContent = responseSearchTerm.trim() ? `${matchCount} 个匹配` : "";
      return;
    }
    const tree = document.createElement("div");
    tree.className = "tree";
    tree.append(renderPreviewValue(decoded.value, null));
    detailContent.append(tree);
    const matchCount = highlightResponseMatches(tree, responseSearchTerm);
    responseSearchCount.textContent = responseSearchTerm.trim() ? `${matchCount} 个匹配` : "";
    return;
  }

  const text = decoded.isJson ? JSON.stringify(decoded.value, null, 2) : decoded.text;
  const codeView = createCodeView(text, decoded.isJson);
  detailContent.append(codeView);
  if (tab === "response") {
    const matchCount = highlightResponseMatches(codeView, responseSearchTerm);
    responseSearchCount.textContent = responseSearchTerm.trim() ? `${matchCount} 个匹配` : "";
  }
}

function createSqlView(sql) {
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

function requestExplainSql(record) {
  const request = record.entry.request;
  const url = new URL(request.url);
  url.searchParams.set("isExplain", "true");

  const method = String(request.method || "GET").toUpperCase();
  const postData = request.postData;
  if (postData?.params?.some((param) => param.fileName)) {
    throw new Error("当前请求包含无法从 DevTools 记录中重放的文件内容。");
  }
  if (postData && typeof postData.text !== "string" && postData.params?.length) {
    throw new Error("当前请求的表单 body 不完整，无法保证参数一致。");
  }

  const excludedHeaders = /^(accept-encoding|connection|content-length|cookie|host|origin|referer|sec-|:)/i;
  const headers = (request.headers || []).filter(({ name }) => name && !excludedHeaders.test(name))
    .map(({ name, value }) => [name, value]);
  const config = {
    url: url.href,
    method,
    headers,
    body: ["GET", "HEAD"].includes(method) ? null : (postData?.text ?? null),
  };
  const key = `__niuniuExplain_${crypto.randomUUID().replaceAll("-", "")}`;
  const configLiteral = JSON.stringify(JSON.stringify(config));
  const tokenLiteral = JSON.stringify(key);
  const expression = `(() => { const key = ${tokenLiteral}; const config = JSON.parse(${configLiteral}); window[key] = { done: false }; fetch(config.url, { method: config.method, headers: config.headers, body: config.body, credentials: "include" }).then(async response => { window[key] = { done: true, ok: response.ok, status: response.status, encryption: response.headers.get("X-Data-Encrypted") || "", text: await response.text() }; }).catch(error => { window[key] = { done: true, error: String(error) }; }); return true; })()`;

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("解释请求超时，请检查接口响应或页面跨域策略。")), 60000);
    chrome.devtools.inspectedWindow.eval(expression, (started, exception) => {
      if (exception || !started) {
        window.clearTimeout(timeout);
        reject(new Error(exception?.value || exception?.description || "无法在当前页面启动解释请求。"));
        return;
      }
      const poll = () => chrome.devtools.inspectedWindow.eval(
        `(() => { const result = window[${tokenLiteral}]; if (result?.done) delete window[${tokenLiteral}]; return result || null; })()`,
        (result, pollException) => {
          if (pollException) {
            window.clearTimeout(timeout);
            reject(new Error("无法读取解释请求结果；页面可能已导航。"));
          }
          else if (result?.done) {
            window.clearTimeout(timeout);
            if (result.error) reject(new Error(`解释请求失败：${result.error}`));
            else if (!result.ok) reject(new Error(`解释接口返回 HTTP ${result.status}：${result.text.slice(0, 300)}`));
            else resolve({ text: result.text, encryption: result.encryption });
          } else window.setTimeout(poll, 150);
        },
      );
      poll();
    });
  });
}

function renderSqlTab(record) {
  const toolbar = document.createElement("div");
  toolbar.className = "sql-toolbar";
  const actions = document.createElement("div");
  actions.className = "sql-actions";
  const fetchButton = document.createElement("button");
  fetchButton.type = "button";
  fetchButton.className = "sql-copy-button";
  setButtonLabel(fetchButton, "↗", record.sqlLoading ? "获取中…" : "获取 SQL");
  fetchButton.disabled = record.sqlLoading;
  fetchButton.addEventListener("click", async () => {
    record.sqlLoading = true;
    record.sqlError = "";
    renderDetails();
    try {
      const explainResponse = await requestExplainSql(record);
      const decodedSql = decodeResponse(explainResponse.text, configuredAesKey(), {
        method: configuredEncryptionMethod(),
        encryption: explainResponse.encryption || responseEncryption(record.entry),
      });
      record.sqlText = extractSql(decodedSql);
    } catch (error) {
      record.sqlError = error.message || "获取 SQL 失败。";
    } finally {
      record.sqlLoading = false;
      if (records.includes(record) && selectedId === record.id && activeTab === "sql") renderDetails();
    }
  });
  const copyButton = document.createElement("button");
  copyButton.type = "button";
  copyButton.className = "sql-copy-button";
  setButtonLabel(copyButton, "⧉", "复制 SQL");
  copyButton.disabled = !record.sqlText;
  copyButton.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(record.sqlText);
      setButtonLabel(copyButton, "✓", "已复制");
    } catch {
      setButtonLabel(copyButton, "!", "复制失败");
    }
    window.setTimeout(() => { setButtonLabel(copyButton, "⧉", "复制 SQL"); }, 1200);
  });
  actions.append(fetchButton, copyButton);
  const state = createNote(record.sqlLoading
    ? "正在获取 SQL…"
    : record.sqlError || (record.sqlText ? "" : "点击“获取 SQL”后，将使用当前请求参数和浏览器登录态请求解释接口。"));
  state.classList.add("sql-state");
  toolbar.append(actions, state);
  detailContent.append(toolbar);

  if (record.sqlText) detailContent.append(createSqlView(record.sqlText));
}

function renderDetails() {
  const record = records.find((item) => item.id === selectedId);
  if (!record) {
    detailsEmpty.hidden = false;
    detailsView.hidden = true;
    return;
  }

  detailsEmpty.hidden = true;
  detailsView.hidden = false;
  const searchableBodyTab = activeTab === "response" || activeTab === "preview";
  const searchLabel = activeTab === "preview" ? "Preview" : "Response";
  responseSearch.hidden = !searchableBodyTab;
  responseSearchInput.value = searchableBodyTab ? responseSearchTerm : "";
  responseSearchInput.placeholder = `搜索 ${searchLabel}`;
  responseSearchInput.setAttribute("aria-label", `搜索 ${searchLabel}`);
  responseSearchCount.textContent = searchableBodyTab && responseSearchTerm.trim() ? "0 个匹配" : "";
  detailContent.dataset.tab = activeTab;
  const response = record.entry.response || {};
  const status = Number(response.status || 0);
  detailMethod.textContent = record.entry.request.method || "GET";
  detailUrl.textContent = record.entry.request.url;
  detailUrl.title = record.entry.request.url;
  detailStatus.textContent = `${status || "—"} ${response.statusText || ""}`.trim();
  detailStatus.className = status >= 400 ? "status-error" : "status-ok";
  detailDuration.textContent = `${Number(record.entry.time || 0).toFixed(0)} ms`;

  renderResponseState(record);
  detailContent.replaceChildren();
  if (activeTab === "headers") renderHeaders(record);
  else if (activeTab === "payload") renderPayload(record);
  else if (activeTab === "sql") renderSqlTab(record);
  else renderBodyTab(record, activeTab);

  detailTabButtons.forEach((button) => {
    const active = button.dataset.tab === activeTab;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
}

requestList.addEventListener("click", (event) => {
  const row = event.target.closest("[data-id]");
  if (!row) return;
  selectedId = Number(row.dataset.id);
  renderList();
  renderDetails();
});

searchInput.addEventListener("input", renderList);
clearRequestsButton.addEventListener("click", clearRecords);

detailTabs.addEventListener("click", (event) => {
  const button = event.target.closest("[data-tab]");
  if (!button) return;
  activeTab = button.dataset.tab;
  renderDetails();
});

responseSearchInput.addEventListener("input", () => {
  responseSearchTerm = responseSearchInput.value;
  renderDetails();
});
responseSearchInput.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  responseSearchTerm = "";
  responseSearchInput.value = "";
  renderDetails();
});
responseSearchClear.addEventListener("click", () => {
  responseSearchTerm = "";
  responseSearchInput.value = "";
  responseSearchInput.focus();
  renderDetails();
});

resizeDivider.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  resizeDivider.setPointerCapture(event.pointerId);
  document.body.classList.add("is-resizing");
  applySidebarWidth(event.clientX - workspace.getBoundingClientRect().left);
  event.preventDefault();
});
resizeDivider.addEventListener("pointermove", (event) => {
  if (!resizeDivider.hasPointerCapture(event.pointerId)) return;
  applySidebarWidth(event.clientX - workspace.getBoundingClientRect().left);
});
function finishSidebarResize() {
  document.body.classList.remove("is-resizing");
}
resizeDivider.addEventListener("pointerup", finishSidebarResize);
resizeDivider.addEventListener("pointercancel", finishSidebarResize);
resizeDivider.addEventListener("lostpointercapture", finishSidebarResize);
resizeDivider.addEventListener("keydown", (event) => {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  event.preventDefault();
  const direction = event.key === "ArrowLeft" ? -16 : 16;
  applySidebarWidth(requestSidebar.getBoundingClientRect().width + direction);
});
window.addEventListener("resize", () => applySidebarWidth(requestSidebar.getBoundingClientRect().width));
applySidebarWidth(requestSidebar.getBoundingClientRect().width || workspace.getBoundingClientRect().width * 0.182);

rawModeToggle.addEventListener("change", () => {
  rawMode = rawModeToggle.checked;
  renderDetails();
});

openSettingsButton.addEventListener("click", () => {
  settingsMethod.value = configuredEncryptionMethod();
  settingsKey.value = configuredAesKey();
  themeSelect.value = configuredTheme();
  updateEncryptionSettings();
  settingsError.hidden = true;
  settingsDialog.showModal();
});

settingsMethod.addEventListener("change", () => {
  settingsError.hidden = true;
  updateEncryptionSettings();
});

cancelSettingsButton.addEventListener("click", () => settingsDialog.close());
resetDefaultKeyButton.addEventListener("click", () => {
  try {
    localStorage.removeItem(AES_KEY_STORAGE_KEY);
    localStorage.removeItem(ENCRYPTION_METHOD_STORAGE_KEY);
  } catch {
    settingsError.textContent = "无法恢复默认密钥，请检查浏览器的扩展存储设置。";
    settingsError.hidden = false;
    return;
  }

  settingsMethod.value = DEFAULT_ENCRYPTION_METHOD;
  settingsKey.value = DEFAULT_AES_KEY;
  updateEncryptionSettings();
  invalidateDecodedRecords();
  settingsDialog.close();
  renderDetails();
});
settingsForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const method = getEncryptionMethod(settingsMethod.value).value;
  const key = settingsKey.value;
  const keyLength = new TextEncoder().encode(key).length;
  const config = getEncryptionMethod(method);
  if (config.keyLengths.length > 0 && !config.keyLengths.includes(keyLength)) {
    settingsError.textContent = `${config.label} 的密钥 UTF-8 长度必须为 ${config.keyLengths.join("、")} 字节。`;
    settingsError.hidden = false;
    return;
  }

  try {
    localStorage.setItem(AES_KEY_STORAGE_KEY, key);
    localStorage.setItem(ENCRYPTION_METHOD_STORAGE_KEY, method);
    localStorage.setItem(THEME_STORAGE_KEY, themeSelect.value);
  } catch {
    settingsError.textContent = "无法保存密钥，请检查浏览器的扩展存储设置。";
    settingsError.hidden = false;
    return;
  }

  applyTheme(themeSelect.value);
  invalidateDecodedRecords();
  settingsDialog.close();
  renderDetails();
});

function addRequest(entry) {
  if (!isApiRequest(entry)) return;
  const record = createRecord(entry);
  loadLiveContent(record, entry);
  renderList();
  renderDetails();
}

chrome.devtools.network.onRequestFinished.addListener(addRequest);
chrome.devtools.network.onNavigated.addListener(clearRecords);

renderList();
