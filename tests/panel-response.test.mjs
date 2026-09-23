import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
globalThis.window = { CryptoJS: createRequire(import.meta.url)("../extension/vendor/crypto-js.js") };
const { loadLiveContent, responseFor } = await import("../extension/panel-response.js");

function record(mimeType = "application/json") {
  return { entry: { response: { content: { mimeType } } }, bodyReady: false, decoded: null };
}

test("HAR body fallback, base64 UTF-8 and raw mode preserve their contracts", () => {
  const value = { title: "你好", encoded: "MT0x" };
  const r = record("application/vnd.api+json; charset=utf-8");
  r.entry.response.content.text = Buffer.from(JSON.stringify(value)).toString("base64");
  r.entry.response.content.encoding = "base64";
  let updates = 0;
  loadLiveContent(r, r.entry, () => { updates += 1; });
  assert.equal(updates, 1);
  assert.deepEqual(responseFor(r, { rawMode: true }).value, value);
  assert.deepEqual(responseFor(r, {}).value, { title: "你好", encoded: "1=1" });
});

test("missing bodies and invalid base64 report errors, while empty bodies stay valid", () => {
  for (const content of [null, undefined, 12]) {
    const r = record();
    loadLiveContent(r, { getContent: (done) => done(content) }, () => {});
    assert.equal(r.bodyReady, true);
    assert.match(r.bodyError, /无法读取/);
  }
  const r = record();
  loadLiveContent(r, { getContent: (done) => done("bad!", "base64") }, () => {});
  assert.match(r.bodyError, /不是可显示/);
  loadLiveContent(r, { getContent: (done) => done("") }, () => {});
  assert.equal(r.bodyError, "");
  assert.equal(responseFor(r, {}).text, "");
});

test("binary bodies remain available for preview", () => {
  const r = record("image/png");
  loadLiveContent(r, { getContent: (done) => done({ content: "AAAA", encoding: "base64" }) }, () => {});
  assert.equal(responseFor(r, {}).isBinary, true);
  assert.equal(r.bodyBase64, "AAAA");
});
