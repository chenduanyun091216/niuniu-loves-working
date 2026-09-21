import { DEFAULT_AES_KEY } from "./crypto.js";
import { decodeDataValue, decodeResponse } from "./response-utils.js";

const requestList = document.getElementById("request-list");
const requestCount = document.getElementById("request-count");
const searchInput = document.getElementById("request-search");
const workspace = document.querySelector(".workspace");
const requestSidebar = document.querySelector(".request-sidebar");
const resizeDivider = document.getElementById("resize-divider");
const detailsEmpty = document.getElementById("details-empty");
const detailsView = document.getElementById("details-view");
const detailContent = document.getElementById("detail-content");
const records = [];
let selectedId = null;
let activeTab = "headers";
let nextId = 1;
const AES_KEY_STORAGE_KEY = "niuniu-aes-key";
const settingsDialog = document.getElementById("settings-dialog");
const settingsForm = document.getElementById("settings-form");
const settingsKey = document.getElementById("aes-key");
const settingsError = document.getElementById("settings-error");
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

function responseMimeType(entry) {
  const contentType = entry.response?.content?.mimeType || "";
  const header = entry.response?.headers?.find((item) => (item.name || "").toLowerCase() === "content-type");
  return (header?.value || contentType).toLowerCase();
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

function loadLiveContent(record, request) {
  if (typeof request.getContent !== "function") {
    record.bodyError = "无法读取响应正文。";
    record.bodyReady = true;
    return;
  }

  try {
    request.getContent((content, encoding) => setResponseContent(record, content, encoding));
  } catch {
    record.bodyError = "无法读取响应正文。";
    record.bodyReady = true;
  }
}

function statusText(record) {
  const status = Number(record.entry.response?.status || 0);
  return status ? String(status) : "—";
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
    icon.className = `request-type-icon${jsonResponse ? " json" : " text"}`;
    icon.textContent = jsonResponse ? "{}" : "<>";
    icon.title = jsonResponse ? "JSON" : "文本";
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

function formatRawJson(text) {
  try {
    return { text: JSON.stringify(JSON.parse(text), null, 2), isJson: true };
  } catch {
    return { text, isJson: false };
  }
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

  if (rawMode && url.search) {
    const section = addSection(detailContent, "Raw Query String");
    section.append(createCodeView(url.search.slice(1)));
  } else if (queryEntries.length) {
    const section = addSection(detailContent, "Query String Parameters");
    addRows(section, queryEntries.map(([name, value]) => [
      name,
      decodeDataValue(value, key).value,
    ]));
  }

  if (rawMode && typeof postData?.text === "string") {
    const section = addSection(detailContent, "Raw Request Body");
    const rawBody = formatRawJson(postData.text);
    section.append(createCodeView(rawBody.text, rawBody.isJson));
  } else if (postData?.params?.length) {
    const section = addSection(detailContent, "Form Data");
    addRows(section, postData.params.map((item) => [
      item.name,
      rawMode ? item.value || "(binary)" : decodeDataValue(item.value || "(binary)", key).value,
    ]));
  } else if (typeof postData?.text === "string") {
    const section = addSection(detailContent, "Request Payload");
    const decoded = decodeResponse(postData.text, key);
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
  record.decoded ??= decodeResponse(record.bodyText || "", configuredAesKey());
  return record.decoded;
}

function renderResponseState(record) {
  const state = document.getElementById("response-state");
  const decoded = responseFor(record);
  state.textContent = record.bodyError || (decoded ? decoded.label : "正在读取响应");
  state.classList.toggle("decrypted", Boolean(decoded?.decrypted));
}

function renderPreviewValue(value, key, depth = 0) {
  if (value !== null && typeof value === "object") {
    const entries = Array.isArray(value)
      ? value.map((item, index) => [String(index), item])
      : Object.entries(value);
    const details = document.createElement("details");
    details.open = depth < 1;
    const summary = document.createElement("summary");
    const label = key === null ? "Response" : key;
    summary.textContent = `${label}: ${Array.isArray(value) ? "Array" : "Object"} (${entries.length})`;
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
      detailContent.append(createCodeView(decoded.text));
      return;
    }
    const tree = document.createElement("div");
    tree.className = "tree";
    tree.append(renderPreviewValue(decoded.value, null));
    detailContent.append(tree);
    return;
  }

  const text = decoded.isJson ? JSON.stringify(decoded.value, null, 2) : decoded.text;
  detailContent.append(createCodeView(text, decoded.isJson));
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
  detailContent.dataset.tab = activeTab;
  document.getElementById("detail-method").textContent = record.entry.request.method || "GET";
  document.getElementById("detail-url").textContent = record.entry.request.url;
  document.getElementById("detail-url").title = record.entry.request.url;
  const status = document.getElementById("detail-status");
  status.textContent = `${statusText(record)} ${record.entry.response.statusText || ""}`.trim();
  status.className = Number(statusText(record)) >= 400 ? "status-error" : "status-ok";
  document.getElementById("detail-duration").textContent = `${Number(record.entry.time || 0).toFixed(0)} ms`;

  renderResponseState(record);
  detailContent.replaceChildren();
  if (activeTab === "headers") renderHeaders(record);
  else if (activeTab === "payload") renderPayload(record);
  else renderBodyTab(record, activeTab);

  document.querySelectorAll(".detail-tabs button").forEach((button) => {
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
document.getElementById("clear-requests").addEventListener("click", () => {
  records.length = 0;
  selectedId = null;
  renderList();
  renderDetails();
});

document.querySelector(".detail-tabs").addEventListener("click", (event) => {
  const button = event.target.closest("[data-tab]");
  if (!button) return;
  activeTab = button.dataset.tab;
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
applySidebarWidth(requestSidebar.getBoundingClientRect().width || workspace.getBoundingClientRect().width * 0.26);

rawModeToggle.addEventListener("change", () => {
  rawMode = rawModeToggle.checked;
  renderDetails();
});

document.getElementById("open-settings").addEventListener("click", () => {
  settingsKey.value = configuredAesKey();
  settingsError.hidden = true;
  settingsDialog.showModal();
});

document.getElementById("cancel-settings").addEventListener("click", () => settingsDialog.close());
document.getElementById("reset-default-key").addEventListener("click", () => {
  try {
    localStorage.removeItem(AES_KEY_STORAGE_KEY);
  } catch {
    settingsError.textContent = "无法恢复默认密钥，请检查浏览器的扩展存储设置。";
    settingsError.hidden = false;
    return;
  }

  for (const record of records) record.decoded = null;
  settingsDialog.close();
  renderDetails();
});
settingsForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const key = settingsKey.value;
  const keyLength = new TextEncoder().encode(key).length;
  if (![16, 24, 32].includes(keyLength)) {
    settingsError.textContent = "密钥的 UTF-8 长度必须为 16、24 或 32 字节。";
    settingsError.hidden = false;
    return;
  }

  try {
    localStorage.setItem(AES_KEY_STORAGE_KEY, key);
  } catch {
    settingsError.textContent = "无法保存密钥，请检查浏览器的扩展存储设置。";
    settingsError.hidden = false;
    return;
  }

  for (const record of records) record.decoded = null;
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
chrome.devtools.network.onNavigated.addListener(() => {
  records.length = 0;
  selectedId = null;
  renderList();
  renderDetails();
});

renderList();
