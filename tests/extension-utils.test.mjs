import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import test from "node:test";

const require = createRequire(import.meta.url);
globalThis.window = { CryptoJS: require("../extension/vendor/crypto-js.js") };

const {
  DEFAULT_AES_KEY,
  decrypt,
  normalizeBase64,
} = await import("../extension/crypto.js");
const {
  hasJsonResponse,
  isExplainRequest,
  isFileResponse,
  isTextMimeType,
  requestIdentity,
  requestName,
  requestResourceType,
  responseMimeType,
} = await import("../extension/network-utils.js");
const { decodeResponse } = await import("../extension/response-utils.js");
const {
  DEFAULT_SQL_BLOCKED_MARKERS,
  extractSql,
  findSqlBlockedMarker,
  parseSqlBlockedMarkers,
} = await import("../extension/sql-utils.js");
const { findTabularData, formatTableCell } = await import("../extension/table-utils.js");

function encryptAes(value, key = DEFAULT_AES_KEY) {
  return window.CryptoJS.AES.encrypt(
    typeof value === "string" ? value : JSON.stringify(value),
    window.CryptoJS.enc.Utf8.parse(key),
    { mode: window.CryptoJS.mode.ECB, padding: window.CryptoJS.pad.Pkcs7 },
  ).ciphertext.toString(window.CryptoJS.enc.Base64);
}

test("AES and Base64 decoding preserve the existing contract", () => {
  const encrypted = encryptAes({ success: true, value: 7 });
  assert.deepEqual(decrypt(encrypted), { success: true, value: 7 });
  assert.equal(decrypt(encrypted, "wrong-key-value!"), encrypted);
  assert.equal(normalizeBase64("MT0x"), "MT0x");
  assert.equal(normalizeBase64("not valid !!!"), "");

  assert.deepEqual(decodeResponse(encrypted).value, { success: true, value: 7 });
  assert.deepEqual(decodeResponse(JSON.stringify({ data: encrypted })).value, {
    data: { success: true, value: 7 },
  });
  assert.equal(decodeResponse("MT0x").value, "1=1");
  assert.equal(decodeResponse("not valid !!!").text, "not valid !!!");
});

test("network metadata helpers classify requests and files", () => {
  const entry = {
    _requestId: "request-1",
    _resourceType: "xhr",
    request: { method: "GET", url: "https://example.test/api/items?size=10" },
    response: {
      status: 200,
      headers: [{ name: "Content-Type", value: "application/json; charset=utf-8" }],
      content: {},
    },
  };
  assert.equal(requestIdentity(entry), "id:request-1");
  assert.equal(requestResourceType(entry), "fetch-xhr");
  assert.equal(requestName(entry.request.url), "items?size=10");
  assert.equal(responseMimeType(entry), "application/json; charset=utf-8");
  assert.equal(hasJsonResponse(entry), true);
  assert.equal(isFileResponse(entry), false);
  assert.equal(isExplainRequest("https://example.test/api?isExplain=true"), true);
  assert.equal(isTextMimeType("image/svg+xml"), true);
  assert.equal(isFileResponse({
    _resourceType: "document",
    response: { headers: [{ name: "Content-Type", value: "application/pdf" }] },
  }), true);
});

test("table discovery chooses the strongest object-list candidate", () => {
  const value = {
    metadata: [{ name: "small" }],
    result: {
      rows: [
        { id: 1, name: "A" },
        { id: 2, name: "B" },
        { id: 3, name: "C" },
      ],
    },
  };
  const table = findTabularData(value);
  assert.equal(table.path, "$.result.rows");
  assert.equal(table.rows.length, 3);
  assert.equal(formatTableCell(undefined), "—");
  assert.equal(formatTableCell({ ok: true }), '{"ok":true}');
});

test("SQL helpers normalize markers and validate explain responses", () => {
  assert.deepEqual(parseSqlBlockedMarkers("make_new, MAKE_NEW\nmake_remove"), ["make_new", "make_remove"]);
  assert.equal(findSqlBlockedMarker("https://example.test/make_update", DEFAULT_SQL_BLOCKED_MARKERS), "make_update");
  assert.equal(extractSql({ value: { data: [{ sql: "\nSELECT 1;\n" }] } }), "SELECT 1;");
  assert.throws(() => extractSql({ value: {} }), /未找到/);
});

test("light and dark themes share the compact professional layout", async () => {
  const [html, css, script, manifestText] = await Promise.all([
    readFile(new URL("../extension/panel.html", import.meta.url), "utf8"),
    readFile(new URL("../extension/panel.css", import.meta.url), "utf8"),
    readFile(new URL("../extension/panel-settings.js", import.meta.url), "utf8"),
    readFile(new URL("../extension/manifest.json", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(html, /option value="professional"/);
  assert.match(html, /id="toggle-theme"/);
  assert.match(html, /theme-icon-moon/);
  assert.match(html, /theme-icon-sun/);
  assert.doesNotMatch(html, /接口调试/);
  assert.doesNotMatch(html, /id="theme-select"/);
  assert.doesNotMatch(script, /themeSelect/);
  assert.match(html, /id="toggle-request-list-mode"/);
  assert.doesNotMatch(html, /id="request-list-mode"/);
  assert.doesNotMatch(html, /id="professional-settings"/);
  assert.doesNotMatch(html, /id="density-select"/);
  assert.match(css, /data-theme="light".*data-theme="dark"/s);
  assert.doesNotMatch(script, /isProfessionalLayout/);
  assert.match(script, /PROFESSIONAL_SIDEBAR_WIDTH_STORAGE_KEY/);
  assert.match(script, /dataset\.density = "compact"/);
  assert.match(script, /themeToggleButton\.addEventListener/);
  assert.equal(JSON.parse(manifestText).version, "1.2.0");
});

test("popup page keeps all outer corners rounded at 15px", async () => {
  const css = await readFile(new URL("../extension/popup.css", import.meta.url), "utf8");
  assert.match(css, /html, body \{ border-radius: 15px;/);
  assert.match(css, /\.popup-card \{[^}]*border-radius: 15px;/);
});

test("structured MIME suffixes are text but actual documents remain files", () => {
  for (const mimeType of ["application/problem+json", "application/vnd.api+json; charset=UTF-8", "application/soap+xml"]) {
    assert.equal(isTextMimeType(mimeType), true);
    assert.equal(isFileResponse({ response: { content: { mimeType } } }), false);
  }
  assert.equal(isFileResponse({ response: { content: { mimeType: "application/vnd.ms-excel" } } }), true);
  assert.equal(isTextMimeType("application/jsonp-binary"), false);
  assert.equal(isFileResponse({ response: { content: { mimeType: "image/svg+xml" } } }), true);
  assert.equal(isExplainRequest("https://example.test/?isExplain=false&isExplain=true"), true);
});

test("DES, 3DES, nested JSON and explicit AES headers keep decoding correctly", () => {
  for (const [method, cipher, key] of [
    ["des-ecb", window.CryptoJS.DES, "12345678"],
    ["3des-ecb", window.CryptoJS.TripleDES, "123456781234567812345678"],
  ]) {
    const encrypted = cipher.encrypt('{"ok":true}', window.CryptoJS.enc.Utf8.parse(key), {
      mode: window.CryptoJS.mode.ECB, padding: window.CryptoJS.pad.Pkcs7,
    }).ciphertext.toString(window.CryptoJS.enc.Base64);
    assert.deepEqual(decodeResponse(encrypted, key, { method }).value, { ok: true });
  }
  const encrypted = encryptAes({ ok: true });
  assert.deepEqual(decodeResponse(encrypted, DEFAULT_AES_KEY, { method: "base64", encryption: "AES" }).value, { ok: true });
  assert.deepEqual(decodeResponse('{"params":"{\\"value\\":\\"MT0x\\"}"}').value, { params: { value: "1=1" } });
});
