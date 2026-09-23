import { loadLiveContent, responseFor as decodeRecordResponse } from "./panel-response.js";
import { configuredAesKey, configuredEncryptionMethod, configuredSqlBlockedMarkers, initializeSettings } from "./panel-settings.js";
import { createCodeView, highlightResponseMatches, formatRawJson, addSection, addRows, createNote, setButtonLabel, renderPreviewValue, renderBinaryPreview, createSqlView } from "./panel-views.js";
import { renderTableTab } from "./panel-table.js";
import { explainRequestUrl, requestExplainSql } from "./sql-replay.js";
import { decodeDataValue, decodeResponse } from "./response-utils.js";
import {
  hasJsonResponse,
  isExplainRequest,
  isFileResponse,
  requestIdentity,
  requestName,
  requestResourceType,
  responseHeader,
  responseMimeType,
} from "./network-utils.js";
import {
  extractSql,
  findSqlBlockedMarker,
} from "./sql-utils.js";
import { findTabularData } from "./table-utils.js";

const requestList = document.getElementById("request-list");
const requestCount = document.getElementById("request-count");
const searchInput = document.getElementById("request-search");
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
let captureGeneration = 0;
let requestFilter = "fetch-xhr";
const sqlConfirmDialog = document.getElementById("sql-confirm-dialog");
const sqlConfirmSummary = document.getElementById("sql-confirm-summary");
const sqlConfirmUrl = document.getElementById("sql-confirm-url");
const globalSearchDialog = document.getElementById("global-search-dialog");
const globalSearchInput = document.getElementById("global-search-input");
const globalSearchSubmit = document.getElementById("global-search-submit");
const globalSearchStatus = document.getElementById("global-search-status");
const globalSearchResults = document.getElementById("global-search-results");
const rawModeToggle = document.getElementById("raw-mode-toggle");
let rawMode = false;

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
  captureGeneration += 1;
  records.length = 0;
  globalSearchResults.replaceChildren();
  selectedId = null;
  renderList();
  renderDetails();
}

function invalidateDecodedRecords() {
  for (const record of records) record.decoded = null;
}

function renderList() {
  const query = searchInput.value.trim().toLowerCase();
  const filtered = records.filter((record) => {
    const request = record.entry.request;
    return requestMatchesFilter(record.entry)
      && `${request.method || "GET"} ${request.url}`.toLowerCase().includes(query);
  });

  const selectedRecord = records.find((record) => record.id === selectedId);
  if (!selectedRecord || !filtered.includes(selectedRecord)) selectedId = filtered[0]?.id ?? null;

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
      rawMode ? item.value ?? "(binary)" : decodeDataValue(item.value ?? "(binary)", key, { method }).value,
    ]));
  } else if (typeof postData?.text === "string") {
    const section = addSection(detailContent, "Request Payload");
    const decoded = decodeResponse(postData.text, key, { method });
    const text = decoded.isJson ? JSON.stringify(decoded.value, null, 2) : decoded.text;
    section.append(createCodeView(text, decoded.isJson));
  }

  if (!url.search && !postData) detailContent.append(createNote("此请求没有 Payload"));
}

function responseFor(record) {
  return decodeRecordResponse(record, {
    rawMode,
    key: configuredAesKey(),
    method: configuredEncryptionMethod(),
  });
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

function tabularDataFor(record) {
  const decoded = responseFor(record);
  return decoded?.isJson ? findTabularData(decoded.value) : null;
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
      const reason = sqlUnavailableReasonFor(record);
      if (reason) throw new Error(reason);
      const explainResponse = await requestExplainSql(record.entry.request);
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
  else if (activeTab === "table") {
    const matchCount = renderTableTab(detailContent, tabularDataFor(record), responseSearchTerm);
    responseSearchCount.textContent = responseSearchTerm.trim() ? `${matchCount || 0} 个匹配` : "";
  }
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
  const record = records.find((item) => item.id === Number(result.dataset.id));
  if (!record) return;
  // A global-search result must be visible even when the list has local filters.
  searchInput.value = "";
  if (!requestMatchesFilter(record.entry)) setRequestFilter("all");
  selectedId = record.id;
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
function setRequestFilter(filter) {
  requestFilter = filter;
  for (const button of requestFilterButtons) {
    const active = button.dataset.requestFilter === filter;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  }
}

for (const button of requestFilterButtons) {
  button.addEventListener("click", () => {
    setRequestFilter(button.dataset.requestFilter || "fetch-xhr");
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

rawModeToggle.addEventListener("change", () => {
  rawMode = rawModeToggle.checked;
  renderList();
  renderDetails();
});

function addRequest(entry, options = {}) {
  const identity = requestIdentity(entry);
  if (records.some((record) => record.identity === identity)) return;
  const record = createRecord(entry, identity);
  let loading = true;
  loadLiveContent(record, entry, () => {
    if (loading || !records.includes(record)) return;
    renderList();
    if (record.id === selectedId) renderDetails();
  });
  loading = false;
  if (options.render !== false) {
    renderList();
    renderDetails();
  }
}

chrome.devtools.network.onRequestFinished.addListener(addRequest);
chrome.devtools.network.onNavigated.addListener(clearRecords);

function loadExistingRequests() {
  if (typeof chrome.devtools.network.getHAR !== "function") return;

  const generation = captureGeneration;
  let handled = false;
  const handleHar = (harLog) => {
    if (handled || generation !== captureGeneration) return;
    handled = true;
    for (const entry of harLog?.entries || []) addRequest(entry, { render: false });
    if (records.length && selectedId === null) selectedId = records[0].id;
    renderList();
    renderDetails();
  };

  try {
    const result = chrome.devtools.network.getHAR(handleHar);
    result?.then?.(handleHar, () => {});
  } catch {
    // Live request capture remains available when HAR retrieval is unsupported.
  }
}

initializeSettings(() => {
  invalidateDecodedRecords();
  renderList();
  renderDetails();
});
renderList();
loadExistingRequests();
