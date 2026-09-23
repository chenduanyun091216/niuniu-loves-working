// Run against the real panel DOM/modules; only the DevTools host and storage are fakes.
const results = document.getElementById("results");
const failures = [];
const layoutSnapshots = [];
const errors = [];
let fixtureId = 0;
const baseline = new URLSearchParams(location.search).has("baseline");
const extensionPath = baseline ? "../baseline/" : "../extension/";
const markup = await fetch(`${extensionPath}panel.html`).then((response) => response.text());

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function panel({ harMode = "callback" } = {}) {
  const frame = document.createElement("iframe");
  const parsed = new DOMParser().parseFromString(markup, "text/html");
  parsed.querySelectorAll("script").forEach((script) => script.remove());
  const base = parsed.createElement("base");
  base.href = new URL(extensionPath, location.href).href;
  parsed.head.prepend(base);
  const loaded = new Promise((resolve) => { frame.onload = resolve; });
  frame.srcdoc = parsed.documentElement.outerHTML;
  document.getElementById("panel").replaceChildren(frame);
  await loaded;
  const win = frame.contentWindow;
  const doc = frame.contentDocument;
  const listeners = {};
  const storage = new Map([["niuniu-theme", "light"]]);
  Object.defineProperty(win, "localStorage", { value: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
  } });
  win.addEventListener("error", (event) => errors.push(event.message));
  win.addEventListener("unhandledrejection", (event) => errors.push(String(event.reason)));
  win.chrome = { devtools: {
    network: {
      onRequestFinished: { addListener: (callback) => { listeners.request = callback; } },
      onNavigated: { addListener: (callback) => { listeners.navigate = callback; } },
      getHAR: (callback) => {
        listeners.har = callback;
        if (harMode === "reject") return Promise.reject(new Error("HAR unavailable"));
      },
    },
    inspectedWindow: { reload() {} },
  } };
  async function script(src, type = "text/javascript") {
    const element = doc.createElement("script");
    element.src = src;
    element.type = type;
    const ready = new Promise((resolve, reject) => {
      element.onload = resolve;
      element.onerror = () => reject(new Error(`Could not load ${src}`));
    });
    doc.body.append(element);
    await ready;
  }
  await script("vendor/crypto-js.js");
  await script(`panel.js?test=${++fixtureId}`, "module");
  const el = (id) => doc.getElementById(id);
  const input = (id, value) => {
    el(id).value = value;
    el(id).dispatchEvent(new win.Event("input", { bubbles: true }));
  };
  const tab = (name) => doc.querySelector(`[data-tab="${name}"]`).click();
  return { frame, win, doc, el, input, tab, listeners, storage };
}

function request(id, { body = '{"data":[{"name":"demo"}]}', type = "fetch", mime = "application/json", deferred = false, postData } = {}) {
  let complete;
  const entry = {
    _requestId: id,
    _resourceType: type,
    request: { method: postData ? "POST" : "GET", url: `https://example.test/${id}`, headers: [], postData },
    response: { status: 200, statusText: "OK", headers: [], content: { mimeType: mime } },
    time: 12,
    getContent(callback) { if (deferred) complete = callback; else callback(body, ""); },
  };
  return { entry, complete: (...args) => complete(...args) };
}

async function check(name, run) {
  if (baseline && !name.startsWith("rendering contracts:")) return;
  const item = document.createElement("li");
  try { await run(); item.className = "pass"; item.textContent = `PASS ${name}`; }
  catch (error) { failures.push(name); item.className = "fail"; item.textContent = `FAIL ${name}: ${error.message}`; }
  results.append(item);
}

await check("async body refreshes table badge", async () => {
  const p = await panel();
  const r = request("async", { deferred: true });
  p.listeners.request(r.entry);
  r.complete('{"data":[{"name":"demo"}]}', "");
  assert(p.doc.querySelector(".request-table-badge").textContent === "表", "badge remains empty");
});

await check("clearing a request filter restores selection", async () => {
  const p = await panel();
  p.listeners.request(request("first").entry);
  p.input("request-search", "no-match");
  p.input("request-search", "");
  assert(!p.el("details-view").hidden, "details stay empty despite visible requests");
});

await check("global search opens a result hidden by type and URL filters", async () => {
  const p = await panel();
  p.listeners.request(request("script", { type: "script", body: "unique-result" }).entry);
  p.listeners.request(request("fetch").entry);
  p.input("request-search", "fetch");
  p.el("global-search").click();
  p.input("global-search-input", "unique-result");
  p.el("global-search-submit").click();
  p.doc.querySelector(".global-search-result").click();
  assert(p.el("detail-url").textContent.endsWith("/script"), "another request is selected");
});

await check("saving the decoder refreshes the current response", async () => {
  const p = await panel();
  const key = "12345678";
  const encrypted = p.win.CryptoJS.DES.encrypt('decoded-value', p.win.CryptoJS.enc.Utf8.parse(key), {
    mode: p.win.CryptoJS.mode.ECB, padding: p.win.CryptoJS.pad.Pkcs7,
  }).ciphertext.toString(p.win.CryptoJS.enc.Base64);
  p.listeners.request(request("des", { body: encrypted }).entry);
  p.tab("response");
  p.el("open-settings").click();
  p.el("encryption-method").value = "des-ecb";
  p.el("aes-key").value = key;
  p.el("settings-form").dispatchEvent(new p.win.Event("submit", { bubbles: true, cancelable: true }));
  assert(p.el("detail-content").textContent.includes("decoded-value"), "old decoded cache remains visible");
});

await check("raw mode refreshes table availability in the request list", async () => {
  const p = await panel();
  p.listeners.request(request("encoded", { body: btoa('[{"id":1}]') }).entry);
  assert(p.doc.querySelector(".request-table-badge").textContent === "表", "fixture not decoded");
  p.el("raw-mode-toggle").checked = true;
  p.el("raw-mode-toggle").dispatchEvent(new p.win.Event("change"));
  assert(p.doc.querySelector(".request-table-badge").textContent === "", "badge represents the previous mode");
});

await check("late HAR cannot resurrect cleared requests", async () => {
  const p = await panel();
  p.el("clear-requests").click();
  p.listeners.har({ entries: [request("stale").entry] });
  assert(!p.doc.querySelector(".request-row"), "cleared requests came back");
});

await check("HAR rejection is handled without an unhandled promise", async () => {
  const start = errors.length;
  await panel({ harMode: "reject" });
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert(errors.length === start, "unhandled HAR rejection");
});

await check("empty form values stay empty", async () => {
  const p = await panel();
  p.listeners.request(request("form", { postData: { params: [{ name: "empty", value: "" }] } }).entry);
  p.tab("payload");
  assert(p.doc.querySelector(".kv-value").textContent === "", "empty string was replaced by (binary)");
});

await check("vendor JSON MIME decodes base64 HAR text", async () => {
  const p = await panel();
  const r = request("vendor", { mime: "application/vnd.api+json", deferred: true });
  p.listeners.request(r.entry);
  r.complete(btoa('{"ok":true}'), "base64");
  p.tab("response");
  assert(p.el("detail-content").textContent.includes('"ok"'), "JSON classified as a binary file");
  assert(!p.doc.querySelector('[data-tab="sql"]').hidden, "JSON classified as a download");
});

await check("response search can match across syntax tokens", async () => {
  const p = await panel();
  p.listeners.request(request("search", { body: '{"name":"demo"}' }).entry);
  p.tab("response");
  p.input("response-search-input", '"name": "demo"');
  assert(p.el("response-search-count").textContent === "1 个匹配", "search failed at token boundary");
  assert(p.el("detail-content").textContent === '{\n  "name": "demo"\n}', "search changed original text");
});

await check("reset settings restores the default sidebar width", async () => {
  const p = await panel();
  p.el("resize-divider").dispatchEvent(new p.win.KeyboardEvent("keydown", { key: "ArrowRight" }));
  p.el("open-settings").click();
  p.el("reset-default-key").click();
  const expected = Math.round(p.doc.querySelector(".workspace").getBoundingClientRect().width * 0.32);
  assert(Number(p.el("resize-divider").getAttribute("aria-valuenow")) === expected, "saved width remains applied");
});

await check("request list mode keeps both sidebar states slightly wider", async () => {
  const p = await panel();
  const workspaceWidth = p.doc.querySelector(".workspace").getBoundingClientRect().width;
  const detailedWidth = Math.round(workspaceWidth * 0.32);
  const minimalWidth = detailedWidth - 72;
  assert(Number(p.el("resize-divider").getAttribute("aria-valuenow")) === detailedWidth, "detailed mode uses the wider default");
  p.el("toggle-request-list-mode").click();
  assert(Number(p.el("resize-divider").getAttribute("aria-valuenow")) === minimalWidth, "minimal mode retains the wider baseline");
  p.el("toggle-request-list-mode").click();
  assert(Number(p.el("resize-divider").getAttribute("aria-valuenow")) === detailedWidth, "reopening restores the wider detailed state");
});

await check("request list scrolling preserves columns and toggle alignment", async () => {
  const p = await panel();
  for (let index = 0; index < 40; index += 1) {
    p.listeners.request(request(`scroll-${index}`).entry);
  }
  const list = p.el("request-list");
  const style = p.win.getComputedStyle(list);
  assert(list.scrollHeight > list.clientHeight, "request list did not overflow vertically");
  assert(style.overflowY === "scroll", "request list owns vertical scrolling");
  assert(style.scrollbarGutter === "stable", "request list reserves the scrollbar gutter");
  const firstRow = p.doc.querySelector(".request-row");
  for (const [headingClass, cellClass] of [["list-heading-method", "request-method"], ["list-heading-status", "request-status"], ["list-heading-time", "request-time"], ["list-heading-toggle", "request-table-badge"]]) {
    const heading = p.doc.querySelector(`.${headingClass}`).getBoundingClientRect();
    const cell = firstRow.querySelector(`.${cellClass}`).getBoundingClientRect();
    assert(Math.abs(heading.x - cell.x) <= 1 && Math.abs(heading.width - cell.width) <= 1, `${headingClass} lost column alignment`);
  }
  p.el("toggle-request-list-mode").click();
  const minimalList = p.el("request-list");
  const minimalStyle = p.win.getComputedStyle(minimalList);
  const minimalHeading = p.el("toggle-request-list-mode").getBoundingClientRect();
  const minimalBadge = p.doc.querySelector(".request-table-badge").getBoundingClientRect();
  assert(minimalStyle.scrollbarGutter === "stable", "minimal mode removed the scrollbar gutter");
  assert(Math.abs(minimalHeading.x - minimalBadge.x) <= 1, `minimal mode toggle lost badge alignment (${minimalHeading.x}/${minimalBadge.x}/${minimalHeading.width}/${minimalBadge.width})`);
});

await check("panel scrollbars share the compact size", async () => {
  const p = await panel();
  const row = Object.fromEntries(Array.from({ length: 8 }, (_, index) => [`column_${index}`, `value-${index}`]));
  p.listeners.request(request("scrollbar-size", { body: JSON.stringify([row]) }).entry);
  p.tab("table");
  for (const selector of [".request-list", ".detail-content"]) {
    const scrollbar = p.win.getComputedStyle(p.doc.querySelector(selector), "::-webkit-scrollbar");
    assert(scrollbar.width === "8px" && scrollbar.height === "8px", `${selector} scrollbar is not compact`);
  }
});

await check("table summary sits at the bottom left", async () => {
  const p = await panel();
  p.listeners.request(request("table-summary", { body: '[{"id":1},{"id":2}]' }).entry);
  p.tab("table");
  const table = p.doc.querySelector(".data-table");
  const summary = p.doc.querySelector(".table-summary");
  const content = p.el("detail-content");
  const tableRect = table.getBoundingClientRect();
  const summaryRect = summary.getBoundingClientRect();
  const contentRect = content.getBoundingClientRect();
  assert(summary.previousElementSibling === table, "table summary is not after the table");
  assert(summaryRect.top >= tableRect.bottom, "table summary is not below the table");
  assert(summaryRect.left <= contentRect.left + 1, "table summary is not at the left edge");
});

await check("table cells never display inherited object properties", async () => {
  const p = await panel();
  p.listeners.request(request("own-fields", { body: '[{"constructor":"demo"},{"id":2}]' }).entry);
  p.tab("table");
  const cell = p.doc.querySelectorAll("tbody tr")[1].children[1];
  assert(cell.textContent === "—", "inherited constructor rendered as data");
});

await check("table index stays against the left divider", async () => {
  const p = await panel();
  p.listeners.request(request("index-alignment", { body: '[{"id":1}]' }).entry);
  p.tab("table");
  const indexCell = p.doc.querySelector(".data-table .table-index");
  const style = p.win.getComputedStyle(indexCell);
  assert(style.textAlign === "center", "table index is not centered");
});

await check("sticky table index masks columns while scrolling right", async () => {
  const p = await panel();
  p.frame.style.width = "650px";
  const row = Object.fromEntries(Array.from({ length: 8 }, (_, index) => [`column_${index}`, `value-${index}`]));
  p.listeners.request(request("sticky-index", { body: JSON.stringify([row]) }).entry);
  p.tab("table");
  await new Promise((resolve) => p.win.requestAnimationFrame(() => p.win.requestAnimationFrame(resolve)));
  const scrollBox = p.el("detail-content");
  scrollBox.scrollLeft = 180;
  const indexCell = p.doc.querySelector(".data-table .table-index");
  const boxRect = scrollBox.getBoundingClientRect();
  const indexRect = indexCell.getBoundingClientRect();
  const style = p.win.getComputedStyle(indexCell);
  assert(indexRect.left <= boxRect.left + 1, `sticky index leaves a left gap (${indexRect.left}/${boxRect.left})`);
  assert(style.backgroundColor !== "rgba(0, 0, 0, 0)", "sticky index does not mask scrolled columns");
});

await check("missing response content reports a read error", async () => {
  const p = await panel();
  const r = request("missing", { deferred: true });
  p.listeners.request(r.entry);
  r.complete(null, "");
  p.tab("response");
  assert(p.el("detail-content").textContent.includes("无法读取"), "missing content treated as an empty success");
});

await check("rendering contracts: tabs, themes, widths, raw JSON, tables and preview", async () => {
  const p = await panel();
  p.listeners.request(request("render", { body: '{"data":[{"id":1,"name":"demo","long":"' + "x".repeat(100) + '"}]}', postData: { text: '{"filter":"MT0x"}' } }).entry);
  for (const theme of ["light", "dark"]) {
    if (p.doc.documentElement.dataset.theme !== theme) p.el("toggle-theme").click();
    for (const width of [1100, 650]) {
      p.frame.style.width = `${width}px`;
      await new Promise((resolve) => p.win.requestAnimationFrame(() => p.win.requestAnimationFrame(resolve)));
      p.win.dispatchEvent(new p.win.Event("resize"));
      for (const name of ["headers", "payload", "preview", "response", "table", "sql"]) {
        p.tab(name);
        assert(p.el("detail-content").childElementCount > 0, `${theme}/${width}/${name} failed to render`);
        const geometry = [".topbar", ".request-sidebar", ".request-summary", ".detail-tabs", "#detail-content"].map((selector) => {
          const element = p.doc.querySelector(selector);
          const rect = element.getBoundingClientRect();
          const style = p.win.getComputedStyle(element);
          return [selector, ...[rect.x, rect.y, rect.width, rect.height].map(Math.round), style.fontSize, style.backgroundColor];
        });
        layoutSnapshots.push({ theme, width, tab: name, geometry, content: p.el("detail-content").innerHTML });
      }
      const rect = p.doc.querySelector(".workspace").getBoundingClientRect();
      assert(rect.width <= width + 1, "workspace overflow");
    }
  }
  p.tab("table");
  p.doc.querySelector(".table-cell-preview").click();
  assert(p.el("table-cell-value").textContent.length === 100, "long cell lost data");
  p.el("table-cell-dialog").close();
  p.frame.style.width = "1100px";
  p.win.dispatchEvent(new p.win.Event("resize"));
});

document.getElementById("status").textContent = `${results.children.length - failures.length}/${results.children.length} passed; ${errors.length} runtime errors`;
window.panelTestResult = { total: results.children.length, failures, errors };

const snapshotOutput = document.createElement("pre");
snapshotOutput.id = "layout-snapshots";
snapshotOutput.hidden = true;
snapshotOutput.textContent = JSON.stringify(layoutSnapshots);
document.body.append(snapshotOutput);
