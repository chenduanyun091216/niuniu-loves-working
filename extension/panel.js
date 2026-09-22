import { DEFAULT_AES_KEY, DEFAULT_ENCRYPTION_METHOD, getEncryptionMethod } from "./crypto.js";
import { decodeDataValue, decodeResponse } from "./response-utils.js";
import {
  hasJsonResponse,
  isExplainRequest,
  isFileResponse,
  isTextMimeType,
  requestIdentity,
  requestName,
  requestResourceType,
  responseHeader,
  responseMimeType,
} from "./network-utils.js";
import {
  DEFAULT_SQL_BLOCKED_MARKERS,
  extractSql,
  findSqlBlockedMarker,
  parseSqlBlockedMarkers,
} from "./sql-utils.js";
import { findTabularData, formatTableCell } from "./table-utils.js";

const requestList = document.getElementById("request-list");
const requestCount = document.getElementById("request-count");
const searchInput = document.getElementById("request-search");
const topbar = document.querySelector(".topbar");
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
const requestFilterButtons = [...document.querySelectorAll("[data-request-filter]")];
const globalSearchButton = document.getElementById("global-search");
const reloadPageButton = document.getElementById("reload-page");
const themeToggleButton = document.getElementById("toggle-theme");
const openSettingsButton = document.getElementById("open-settings");
const detailTabs = document.querySelector(".detail-tabs");
const detailTabButtons = [...detailTabs.querySelectorAll("button")];
const tableTabButton = document.getElementById("table-tab");
const sqlTabButton = detailTabs.querySelector('[data-tab="sql"]');
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
let requestFilter = "fetch-xhr";
const SQL_KEYWORDS = new Set("ADD ALL ALTER AND ANY AS ASC BETWEEN BY CASE CAST COLLATE COLUMN COMMIT CONSTRAINT CREATE CROSS CURRENT_DATE CURRENT_TIME CURRENT_TIMESTAMP DATABASE DEFAULT DELETE DESC DISTINCT DROP ELSE END EXCEPT EXISTS FALSE FETCH FIRST FOR FOREIGN FROM FULL GRANT GROUP HAVING IN INDEX INNER INSERT INTERSECT INTO IS JOIN KEY LEFT LIKE LIMIT NOT NULL OFFSET ON OR ORDER OUTER PRIMARY REFERENCES RETURNING RIGHT ROLLBACK ROW SELECT SET TABLE THEN TRUE UNION UNIQUE UPDATE USING VALUES WHEN WHERE WITH".split(" "));
const AES_KEY_STORAGE_KEY = "niuniu-aes-key";
const ENCRYPTION_METHOD_STORAGE_KEY = "niuniu-encryption-method";
const THEME_STORAGE_KEY = "niuniu-theme";
const SQL_BLOCKED_MARKERS_STORAGE_KEY = "niuniu-sql-blocked-markers";
const PROFESSIONAL_LIST_MODE_STORAGE_KEY = "niuniu-professional-request-list";
const PROFESSIONAL_SIDEBAR_WIDTH_STORAGE_KEY = "niuniu-professional-sidebar-width";
const PROFESSIONAL_LIST_MODE_WIDTH_DELTA = 72;
const settingsDialog = document.getElementById("settings-dialog");
const settingsForm = document.getElementById("settings-form");
const settingsMethod = document.getElementById("encryption-method");
const settingsKey = document.getElementById("aes-key");
const requestListModeToggle = document.getElementById("toggle-request-list-mode");
const settingsSqlBlockedMarkers = document.getElementById("sql-blocked-markers");
const settingsHint = document.querySelector(".settings-hint");
const settingsError = document.getElementById("settings-error");
const cancelSettingsButton = document.getElementById("cancel-settings");
const resetDefaultKeyButton = document.getElementById("reset-default-key");
const sqlConfirmDialog = document.getElementById("sql-confirm-dialog");
const sqlConfirmSummary = document.getElementById("sql-confirm-summary");
const sqlConfirmUrl = document.getElementById("sql-confirm-url");
const globalSearchDialog = document.getElementById("global-search-dialog");
const globalSearchInput = document.getElementById("global-search-input");
const globalSearchSubmit = document.getElementById("global-search-submit");
const globalSearchStatus = document.getElementById("global-search-status");
const globalSearchResults = document.getElementById("global-search-results");
const rawModeToggle = document.getElementById("raw-mode-toggle");
const tableCellDialog = document.getElementById("table-cell-dialog");
const tableCellValue = document.getElementById("table-cell-value");
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

function configuredSqlBlockedMarkers() {
  try {
    const savedMarkers = localStorage.getItem(SQL_BLOCKED_MARKERS_STORAGE_KEY);
    return savedMarkers === null ? [...DEFAULT_SQL_BLOCKED_MARKERS] : parseSqlBlockedMarkers(savedMarkers);
  } catch {
    return [...DEFAULT_SQL_BLOCKED_MARKERS];
  }
}

function sqlBlockedMarkerFor(record) {
  return findSqlBlockedMarker(record.entry.request?.url, configuredSqlBlockedMarkers());
}

function sqlUnavailableReasonFor(record) {
  if (isFileResponse(record.entry)) {
    return "图片或文件类响应不支持获取 SQL。";
  }
  if (isExplainRequest(record.entry.request?.url)) {
    return "当前请求已包含 isExplain=true，不能再次获取 SQL。";
  }
  const blockedMarker = sqlBlockedMarkerFor(record);
  return blockedMarker ? `当前接口包含禁止标识“${blockedMarker}”，已禁止获取 SQL。` : "";
}

function updateEncryptionSettings() {
  const config = getEncryptionMethod(settingsMethod.value);
  const requiresKey = config.keyLengths.length > 0;
  settingsKey.disabled = !requiresKey;
  settingsKey.required = requiresKey;
  settingsHint.textContent = requiresKey
    ? `${config.label}：密钥和 SQL 禁止标识只保存在此扩展的本地配置中。密钥 UTF-8 长度需为 ${config.keyLengths.join("、")} 字节。`
    : "Base64 不需要密钥。解密方式和 SQL 禁止标识只保存在此扩展的本地配置中。";
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

function configuredProfessionalListMode() {
  try {
    return localStorage.getItem(PROFESSIONAL_LIST_MODE_STORAGE_KEY) === "minimal" ? "minimal" : "detailed";
  } catch {
    return "detailed";
  }
}

function isProfessionalLayout() {
  return true;
}

function updateRequestListModeToggle() {
  const minimal = document.documentElement.dataset.requestListMode === "minimal";
  requestListModeToggle.textContent = minimal ? ">" : "<";
  requestListModeToggle.title = minimal ? "展开 Method、Status、Time" : "收起 Method、Status、Time";
  requestListModeToggle.setAttribute("aria-label", requestListModeToggle.title);
}

function updateThemeToggle() {
  const dark = document.documentElement.dataset.theme === "dark";
  themeToggleButton.title = dark ? "切换到亮色主题" : "切换到暗色主题";
  themeToggleButton.setAttribute("aria-label", themeToggleButton.title);
  themeToggleButton.setAttribute("aria-pressed", String(dark));
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.density = "compact";
  document.documentElement.dataset.requestListMode = configuredProfessionalListMode();
  updateRequestListModeToggle();
  updateThemeToggle();
}

applyTheme(configuredTheme());

function responseEncryption(entry) {
  return responseHeader(entry, "x-data-encrypted").trim().toUpperCase();
}

function requestMatchesFilter(entry) {
  return requestFilter === "all" || requestResourceType(entry) === requestFilter;
}

function createRecord(entry, identity = requestIdentity(entry)) {
  const record = {
    id: nextId++,
    identity,
    entry,
    bodyText: null,
    bodyBase64: null,
    bodyEncoding: "",
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

function decodeBase64Text(content) {
  const binary = atob(content);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function isBinaryResponse(record) {
  return record.bodyEncoding === "base64" && !isTextMimeType(responseMimeType(record.entry));
}

function setResponseContent(record, content, encoding) {
  if (content && typeof content === "object") {
    encoding = content.encoding || "";
    content = content.content;
  }

  try {
    record.bodyEncoding = encoding === "base64" ? "base64" : "";
    record.bodyBase64 = record.bodyEncoding ? content : null;
    record.bodyText = record.bodyEncoding && isTextMimeType(responseMimeType(record.entry))
      ? decodeBase64Text(content)
      : record.bodyEncoding ? null : content;
    record.bodyReady = true;
    record.bodyError = "";
    record.decoded = null;
  } catch {
    record.bodyText = "";
    record.bodyBase64 = null;
    record.bodyEncoding = "";
    record.bodyReady = true;
    record.bodyError = "响应内容不是可显示的文本。";
  }

  if (record.id === selectedId) renderDetails();
}

function setBodyError(record, message) {
  record.bodyText = "";
  record.bodyBase64 = null;
  record.bodyEncoding = "";
  record.bodyReady = true;
  record.bodyError = message;
  if (record.id === selectedId) renderDetails();
}

function loadLiveContent(record, request) {
  if (typeof request.getContent !== "function") {
    const content = request.response?.content;
    if (typeof content?.text === "string") {
      setResponseContent(record, content.text, content.encoding);
      return;
    }
    setBodyError(record, "无法读取响应正文。");
    return;
  }

  try {
    request.getContent((content, encoding) => setResponseContent(record, content, encoding));
  } catch {
    setBodyError(record, "无法读取响应正文。");
  }
}

function renderList() {
  const query = searchInput.value.trim().toLowerCase();
  const filtered = records.filter((record) => {
    const request = record.entry.request;
    return requestMatchesFilter(record.entry)
      && `${request.method || "GET"} ${request.url}`.toLowerCase().includes(query);
  });

  const selectedRecord = records.find((record) => record.id === selectedId);
  if (selectedRecord && !filtered.includes(selectedRecord)) selectedId = filtered[0]?.id ?? null;

  requestCount.textContent = requestFilter === "all" && !query
    ? `${records.length} 个请求`
    : `${filtered.length} / ${records.length} 个请求`;
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
    const method = document.createElement("span");
    method.className = "request-method";
    method.textContent = request.method || "GET";
    const status = document.createElement("span");
    const statusCode = Number(record.entry.response?.status || 0);
    status.className = `request-status${statusCode >= 400 ? " status-error" : ""}`;
    status.textContent = statusCode || "—";
    const duration = document.createElement("span");
    duration.className = "request-time";
    duration.textContent = `${Number(record.entry.time || 0).toFixed(0)} ms`;
    const tableBadge = document.createElement("span");
    tableBadge.className = "request-table-badge";
    if (tabularDataFor(record)) {
      tableBadge.textContent = "表";
      tableBadge.title = "可生成表格";
      tableBadge.setAttribute("aria-label", "可生成表格");
    } else {
      tableBadge.classList.add("empty");
      tableBadge.setAttribute("aria-hidden", "true");
    }
    row.append(icon, name, method, status, duration, tableBadge);
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
  topbar.style.setProperty("--sidebar-width", `${Math.round(nextWidth)}px`);
  resizeDivider.setAttribute("aria-valuemin", String(Math.round(minWidth)));
  resizeDivider.setAttribute("aria-valuemax", String(Math.round(maxWidth)));
  resizeDivider.setAttribute("aria-valuenow", String(Math.round(nextWidth)));
}

function configuredProfessionalSidebarWidth() {
  try {
    const width = Number(localStorage.getItem(PROFESSIONAL_SIDEBAR_WIDTH_STORAGE_KEY));
    return Number.isFinite(width) && width > 0 ? width : 0;
  } catch {
    return 0;
  }
}

function saveProfessionalSidebarWidth() {
  if (!isProfessionalLayout()) return;
  try {
    localStorage.setItem(PROFESSIONAL_SIDEBAR_WIDTH_STORAGE_KEY, String(Math.round(requestSidebar.getBoundingClientRect().width)));
  } catch {
    // The resized layout remains available for the current panel session.
  }
}

function resizeSidebarForRequestListMode(previousMode, nextMode) {
  if (!isProfessionalLayout() || previousMode === nextMode) return;
  const direction = nextMode === "minimal" ? -1 : 1;
  applySidebarWidth(requestSidebar.getBoundingClientRect().width + direction * PROFESSIONAL_LIST_MODE_WIDTH_DELTA);
  saveProfessionalSidebarWidth();
}

function applyThemeLayout() {
  renderList();
  renderDetails();
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
  if (!isProfessionalLayout() || !text) {
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
  if (isBinaryResponse(record)) {
    const mimeType = responseMimeType(record.entry) || "application/octet-stream";
    return {
      value: null,
      text: "",
      isJson: false,
      isBinary: true,
      mimeType,
      decrypted: false,
      label: `二进制 · ${mimeType}`,
    };
  }
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

function searchableResponseText(record) {
  const decoded = responseFor(record);
  if (!decoded) return "";
  if (decoded.isBinary) return "";
  return decoded.isJson ? JSON.stringify(decoded.value, null, 2) : decoded.text;
}

function globalSearchSnippet(text, term) {
  const index = text.toLocaleLowerCase().indexOf(term.toLocaleLowerCase());
  if (index < 0) return text.slice(0, 180);
  const start = Math.max(0, index - 70);
  const end = Math.min(text.length, index + term.length + 110);
  return `${start ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
}

function renderGlobalSearchResults() {
  const term = globalSearchInput.value.trim();
  globalSearchResults.replaceChildren();
  if (!term) {
    globalSearchStatus.textContent = "输入关键词搜索已捕获的接口响应。";
    return;
  }

  const normalizedTerm = term.toLocaleLowerCase();
  const matches = records.filter((record) => {
    const request = record.entry.request || {};
    const responseText = searchableResponseText(record);
    return `${request.method || "GET"} ${request.url || ""}`.toLocaleLowerCase().includes(normalizedTerm)
      || responseText.toLocaleLowerCase().includes(normalizedTerm);
  });
  globalSearchStatus.textContent = `${matches.length} 个接口匹配“${term}”`;
  if (!matches.length) {
    globalSearchResults.append(Object.assign(document.createElement("div"), {
      className: "global-search-empty",
      textContent: records.some((record) => !record.bodyReady)
        ? "暂无匹配；部分响应仍在读取中。"
        : "没有找到匹配的接口或返回内容。",
    }));
    return;
  }

  for (const record of matches) {
    const request = record.entry.request || {};
    const responseText = searchableResponseText(record);
    const result = document.createElement("button");
    result.type = "button";
    result.className = "global-search-result";
    result.dataset.id = String(record.id);
    result.dataset.responseMatch = String(responseText.toLocaleLowerCase().includes(normalizedTerm));
    const title = document.createElement("div");
    title.className = "global-search-result-title";
    const name = document.createElement("strong");
    name.textContent = requestName(request.url || "未知接口");
    const method = document.createElement("span");
    method.textContent = request.method || "GET";
    title.append(method, name);
    const url = document.createElement("div");
    url.className = "global-search-result-url";
    url.textContent = request.url || "";
    const snippet = document.createElement("div");
    snippet.className = "global-search-result-snippet";
    snippet.textContent = responseText ? globalSearchSnippet(responseText, term) : "响应正文仍在读取中。";
    result.append(title, url, snippet);
    globalSearchResults.append(result);
  }
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

function tabularDataFor(record) {
  const decoded = responseFor(record);
  return decoded?.isJson ? findTabularData(decoded.value) : null;
}

function addTableColumnResizer(header) {
  const resizer = document.createElement("span");
  resizer.className = "table-column-resizer";
  resizer.tabIndex = 0;
  resizer.setAttribute("role", "separator");
  resizer.setAttribute("aria-orientation", "vertical");
  resizer.setAttribute("aria-label", `调整 ${header.textContent} 列宽`);

  const setWidth = (width) => {
    const nextWidth = Math.max(72, Math.round(width));
    header.style.width = `${nextWidth}px`;
    header.style.minWidth = `${nextWidth}px`;
    resizer.setAttribute("aria-valuenow", String(nextWidth));
  };
  resizer.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    resizer.setPointerCapture(event.pointerId);
    document.body.classList.add("is-table-resizing");
    resizer.dataset.startX = String(event.clientX);
    resizer.dataset.startWidth = String(header.getBoundingClientRect().width);
    event.preventDefault();
  });
  resizer.addEventListener("pointermove", (event) => {
    if (!resizer.hasPointerCapture(event.pointerId)) return;
    setWidth(Number(resizer.dataset.startWidth) + event.clientX - Number(resizer.dataset.startX));
  });
  const finishResize = () => document.body.classList.remove("is-table-resizing");
  resizer.addEventListener("pointerup", finishResize);
  resizer.addEventListener("pointercancel", finishResize);
  resizer.addEventListener("lostpointercapture", finishResize);
  resizer.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    setWidth(header.getBoundingClientRect().width + (event.key === "ArrowLeft" ? -12 : 12));
  });
  header.append(resizer);
}

function createTableCell(value) {
  const cell = document.createElement("td");
  const text = formatTableCell(value);
  if (!isProfessionalLayout() || text.length <= 80) {
    cell.textContent = text;
    return cell;
  }
  const button = document.createElement("button");
  button.type = "button";
  button.className = "table-cell-preview";
  button.textContent = text;
  button.title = "查看完整内容";
  button.addEventListener("click", () => {
    tableCellValue.textContent = text;
    tableCellDialog.showModal();
  });
  cell.append(button);
  return cell;
}

function renderTableTab(record) {
  const tableData = tabularDataFor(record);
  if (!tableData) {
    detailContent.append(createNote("此接口没有可展示为表格的字典列表"));
    return;
  }

  const columns = [];
  const columnSet = new Set();
  for (const row of tableData.rows) {
    for (const key of Object.keys(row)) {
      if (!columnSet.has(key)) {
        columnSet.add(key);
        columns.push(key);
      }
    }
  }

  const summary = document.createElement("div");
  summary.className = "table-summary";
  summary.textContent = `${tableData.path} · ${tableData.rows.length} 条`;
  detailContent.append(summary);

  if (!columns.length) {
    detailContent.append(createNote("列表中的对象没有可展示字段"));
    return;
  }

  const table = document.createElement("table");
  table.className = "data-table";
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  const indexHeader = document.createElement("th");
  indexHeader.className = "table-index";
  indexHeader.scope = "col";
  indexHeader.textContent = "序号";
  if (isProfessionalLayout()) addTableColumnResizer(indexHeader);
  headerRow.append(indexHeader);
  for (const column of columns) {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = column;
    if (isProfessionalLayout()) addTableColumnResizer(cell);
    headerRow.append(cell);
  }
  thead.append(headerRow);

  const tbody = document.createElement("tbody");
  for (const [index, row] of tableData.rows.entries()) {
    const tableRow = document.createElement("tr");
    const indexCell = document.createElement("td");
    indexCell.className = "table-index";
    indexCell.textContent = String(index + 1);
    tableRow.append(indexCell);
    for (const column of columns) {
      tableRow.append(createTableCell(row[column]));
    }
    tbody.append(tableRow);
  }

  table.append(thead, tbody);
  detailContent.append(table);
  const matchCount = highlightResponseMatches(table, responseSearchTerm);
  responseSearchCount.textContent = responseSearchTerm.trim() ? `${matchCount} 个匹配` : "";
}

function renderBinaryPreview(record, decoded) {
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

function renderBodyTab(record, tab) {
  if (record.bodyError) {
    detailContent.append(createNote(record.bodyError));
    return;
  }
  if (!record.bodyReady) {
    detailContent.append(createNote("正在读取响应正文…"));
    return;
  }
  const decoded = responseFor(record);
  if (decoded?.isBinary) {
    if (tab === "preview") detailContent.append(renderBinaryPreview(record, decoded));
    else detailContent.append(createNote(`${decoded.mimeType} 是二进制响应，Response 仅适用于文本内容。`));
    return;
  }
  if (!record.bodyText) {
    detailContent.append(createNote("此接口没有响应正文"));
    return;
  }

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

function explainRequestUrl(requestUrl) {
  const url = new URL(requestUrl);
  url.searchParams.set("isExplain", "true");
  return url.href;
}

function confirmSqlReplay(record) {
  const request = record.entry.request;
  const method = String(request.method || "GET").toUpperCase();
  sqlConfirmSummary.textContent = `当前请求是 ${method}。获取 SQL 会在当前页面登录态中重新发送原请求，并追加 isExplain=true。`;
  sqlConfirmUrl.textContent = explainRequestUrl(request.url);
  sqlConfirmDialog.returnValue = "cancel";
  return new Promise((resolve) => {
    sqlConfirmDialog.addEventListener(
      "close",
      () => resolve(sqlConfirmDialog.returnValue === "confirm"),
      { once: true },
    );
    sqlConfirmDialog.showModal();
  });
}

function requestExplainSql(record) {
  const unavailableReason = sqlUnavailableReasonFor(record);
  if (unavailableReason) throw new Error(unavailableReason);

  const request = record.entry.request;

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
    url: explainRequestUrl(request.url),
    method,
    headers,
    body: ["GET", "HEAD"].includes(method) ? null : (postData?.text ?? null),
  };
  const key = `__niuniuExplain_${crypto.randomUUID().replaceAll("-", "")}`;
  const configLiteral = JSON.stringify(JSON.stringify(config));
  const tokenLiteral = JSON.stringify(key);
  const expression = `(() => { const key = ${tokenLiteral}; const config = JSON.parse(${configLiteral}); const controller = new AbortController(); const timeout = window.setTimeout(() => controller.abort(), 60000); window[key] = { done: false, controller, timeout }; fetch(config.url, { method: config.method, headers: config.headers, body: config.body, credentials: "include", signal: controller.signal }).then(async response => { const current = window[key]; if (!current) return; window.clearTimeout(current.timeout); window[key] = { done: true, ok: response.ok, status: response.status, encryption: response.headers.get("X-Data-Encrypted") || "", text: await response.text() }; }).catch(error => { const current = window[key]; if (!current) return; window.clearTimeout(current.timeout); window[key] = { done: true, error: error?.name === "AbortError" ? "解释请求超时，请检查接口响应或页面跨域策略。" : String(error) }; }); return true; })()`;
  const pollExpression = `(() => { const result = window[${tokenLiteral}]; if (!result) return null; if (!result.done) return { done: false }; delete window[${tokenLiteral}]; return result; })()`;
  const cleanupExpression = `(() => { const result = window[${tokenLiteral}]; if (result?.timeout) window.clearTimeout(result.timeout); result?.controller?.abort(); delete window[${tokenLiteral}]; return true; })()`;

  return new Promise((resolve, reject) => {
    let settled = false;
    let pollTimer = null;
    const watchdog = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      if (pollTimer !== null) window.clearTimeout(pollTimer);
      try {
        chrome.devtools.inspectedWindow.eval(cleanupExpression, () => {});
      } catch {
        // The inspected page may have navigated while the request was running.
      }
      reject(new Error("解释请求超时，请检查接口响应或页面跨域策略。"));
    }, 65000);
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(watchdog);
      if (pollTimer !== null) window.clearTimeout(pollTimer);
      callback();
    };

    chrome.devtools.inspectedWindow.eval(expression, (started, exception) => {
      if (exception || !started) {
        finish(() => reject(new Error(exception?.value || exception?.description || "无法在当前页面启动解释请求。")));
        return;
      }
      const poll = () => chrome.devtools.inspectedWindow.eval(
        pollExpression,
        (result, pollException) => {
          if (pollException) {
            finish(() => reject(new Error("无法读取解释请求结果；页面可能已导航。")));
          }
          else if (result?.done) {
            finish(() => {
              if (result.error) reject(new Error(`解释请求失败：${result.error}`));
              else if (!result.ok) reject(new Error(`解释接口返回 HTTP ${result.status}：${result.text.slice(0, 300)}`));
              else resolve({ text: result.text, encryption: result.encryption });
            });
          } else if (!settled) pollTimer = window.setTimeout(poll, 150);
        },
      );
      poll();
    });
  });
}

function renderSqlTab(record) {
  const unavailableReason = sqlUnavailableReasonFor(record);
  const toolbar = document.createElement("div");
  toolbar.className = "sql-toolbar";
  const actions = document.createElement("div");
  actions.className = "sql-actions";
  const fetchButton = document.createElement("button");
  fetchButton.type = "button";
  fetchButton.className = "sql-copy-button";
  setButtonLabel(fetchButton, "↗", record.sqlLoading ? "获取中…" : "获取 SQL");
  fetchButton.disabled = record.sqlLoading || Boolean(unavailableReason);
  if (unavailableReason) fetchButton.title = unavailableReason;
  fetchButton.addEventListener("click", async () => {
    if (unavailableReason) return;
    if (!await confirmSqlReplay(record)) return;

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
  const state = createNote(unavailableReason
    ? unavailableReason
    : record.sqlLoading
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
    tableTabButton.hidden = true;
    detailsEmpty.hidden = false;
    detailsView.hidden = true;
    return;
  }

  detailsEmpty.hidden = true;
  detailsView.hidden = false;
  const tableAvailable = Boolean(tabularDataFor(record));
  sqlTabButton.hidden = isFileResponse(record.entry);
  if (activeTab === "sql" && sqlTabButton.hidden) activeTab = "headers";
  tableTabButton.hidden = !tableAvailable;
  if (!tableAvailable && activeTab === "table") activeTab = "preview";
  const searchableBodyTab = activeTab === "response" || activeTab === "preview" || activeTab === "table";
  const searchLabel = activeTab === "preview" ? "Preview" : activeTab === "table" ? "表格" : "Response";
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
  else if (activeTab === "table") renderTableTab(record);
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

searchInput.addEventListener("input", () => {
  renderList();
  renderDetails();
});
globalSearchButton.addEventListener("click", () => {
  globalSearchInput.value = "";
  globalSearchResults.replaceChildren();
  globalSearchStatus.textContent = "输入关键词后点击搜索图标，搜索已捕获的接口响应。";
  globalSearchDialog.showModal();
  globalSearchInput.focus();
});
globalSearchSubmit.addEventListener("click", renderGlobalSearchResults);
globalSearchInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  renderGlobalSearchResults();
});
globalSearchResults.addEventListener("click", (event) => {
  const result = event.target.closest("[data-id]");
  if (!result) return;
  selectedId = Number(result.dataset.id);
  activeTab = "response";
  responseSearchTerm = result.dataset.responseMatch === "true" ? globalSearchInput.value.trim() : "";
  globalSearchDialog.close();
  renderList();
  renderDetails();
});
reloadPageButton.addEventListener("click", () => {
  clearRecords();
  try {
    chrome.devtools.inspectedWindow.reload({ ignoreCache: true });
  } catch {
    // Keep the panel usable in test harnesses without the DevTools API.
  }
});
for (const button of requestFilterButtons) {
  button.addEventListener("click", () => {
    requestFilter = button.dataset.requestFilter || "fetch-xhr";
    for (const filterButton of requestFilterButtons) {
      const active = filterButton === button;
      filterButton.classList.toggle("active", active);
      filterButton.setAttribute("aria-pressed", String(active));
    }
    renderList();
    renderDetails();
  });
}
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
  const width = Math.round(requestSidebar.getBoundingClientRect().width);
  if (isProfessionalLayout()) {
    try {
      localStorage.setItem(PROFESSIONAL_SIDEBAR_WIDTH_STORAGE_KEY, String(width));
    } catch {
      // Resizing remains available when local storage is unavailable.
    }
  }
}
resizeDivider.addEventListener("pointerup", finishSidebarResize);
resizeDivider.addEventListener("pointercancel", finishSidebarResize);
resizeDivider.addEventListener("lostpointercapture", finishSidebarResize);
resizeDivider.addEventListener("keydown", (event) => {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  event.preventDefault();
  const direction = event.key === "ArrowLeft" ? -16 : 16;
  applySidebarWidth(requestSidebar.getBoundingClientRect().width + direction);
  finishSidebarResize();
});
window.addEventListener("resize", () => applySidebarWidth(requestSidebar.getBoundingClientRect().width));
applySidebarWidth(configuredProfessionalSidebarWidth() || workspace.getBoundingClientRect().width * 0.3);

rawModeToggle.addEventListener("change", () => {
  rawMode = rawModeToggle.checked;
  renderDetails();
});

themeToggleButton.addEventListener("click", () => {
  const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  try {
    localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  } catch {
    // The toggle remains usable for the current panel session.
  }
  applyTheme(nextTheme);
  applyThemeLayout();
});

openSettingsButton.addEventListener("click", () => {
  settingsMethod.value = configuredEncryptionMethod();
  settingsKey.value = configuredAesKey();
  settingsSqlBlockedMarkers.value = configuredSqlBlockedMarkers().join("\n");
  updateEncryptionSettings();
  settingsError.hidden = true;
  settingsDialog.showModal();
});

settingsMethod.addEventListener("change", () => {
  settingsError.hidden = true;
  updateEncryptionSettings();
});
requestListModeToggle.addEventListener("click", () => {
  if (!isProfessionalLayout()) return;
  const previousMode = document.documentElement.dataset.requestListMode;
  const nextMode = document.documentElement.dataset.requestListMode === "minimal" ? "detailed" : "minimal";
  try {
    localStorage.setItem(PROFESSIONAL_LIST_MODE_STORAGE_KEY, nextMode);
  } catch {
    // The toggle remains usable for the current panel session.
  }
  resizeSidebarForRequestListMode(previousMode, nextMode);
  document.documentElement.dataset.requestListMode = nextMode;
  updateRequestListModeToggle();
  renderList();
  renderDetails();
});

cancelSettingsButton.addEventListener("click", () => settingsDialog.close());
resetDefaultKeyButton.addEventListener("click", () => {
  try {
    localStorage.removeItem(AES_KEY_STORAGE_KEY);
    localStorage.removeItem(ENCRYPTION_METHOD_STORAGE_KEY);
    localStorage.removeItem(THEME_STORAGE_KEY);
    localStorage.removeItem(SQL_BLOCKED_MARKERS_STORAGE_KEY);
    localStorage.removeItem(PROFESSIONAL_LIST_MODE_STORAGE_KEY);
    localStorage.removeItem(PROFESSIONAL_SIDEBAR_WIDTH_STORAGE_KEY);
  } catch {
    settingsError.textContent = "无法恢复默认设置，请检查浏览器的扩展存储设置。";
    settingsError.hidden = false;
    return;
  }

  settingsMethod.value = DEFAULT_ENCRYPTION_METHOD;
  settingsKey.value = DEFAULT_AES_KEY;
  settingsSqlBlockedMarkers.value = DEFAULT_SQL_BLOCKED_MARKERS.join("\n");
  updateEncryptionSettings();
  invalidateDecodedRecords();
  applyTheme(configuredTheme());
  applyThemeLayout();
  settingsDialog.close();
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
    localStorage.setItem(
      SQL_BLOCKED_MARKERS_STORAGE_KEY,
      parseSqlBlockedMarkers(settingsSqlBlockedMarkers.value).join("\n"),
    );
  } catch {
    settingsError.textContent = "无法保存设置，请检查浏览器的扩展存储设置。";
    settingsError.hidden = false;
    return;
  }

  invalidateDecodedRecords();
  settingsDialog.close();
});

function addRequest(entry, options = {}) {
  const identity = requestIdentity(entry);
  if (records.some((record) => record.identity === identity)) return;
  const record = createRecord(entry, identity);
  loadLiveContent(record, entry);
  if (options.render !== false) {
    renderList();
    renderDetails();
  }
}

chrome.devtools.network.onRequestFinished.addListener(addRequest);
chrome.devtools.network.onNavigated.addListener(clearRecords);

function loadExistingRequests() {
  if (typeof chrome.devtools.network.getHAR !== "function") return;

  let handled = false;
  const handleHar = (harLog) => {
    if (handled) return;
    handled = true;
    for (const entry of harLog?.entries || []) addRequest(entry, { render: false });
    if (records.length && selectedId === null) selectedId = records[0].id;
    renderList();
    renderDetails();
  };

  try {
    const result = chrome.devtools.network.getHAR(handleHar);
    result?.catch?.(() => {});
    result?.then?.(handleHar);
  } catch {
    // Live request capture remains available when HAR retrieval is unsupported.
  }
}

renderList();
loadExistingRequests();
