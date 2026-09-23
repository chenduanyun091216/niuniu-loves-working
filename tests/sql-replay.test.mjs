import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { requestExplainSql } from "../extension/sql-replay.js";

const request = { url: "https://example.test/api", method: "POST", headers: [], postData: { text: '{"name":"demo"}' } };

function host(evaluate) {
  let nextTimer = 0;
  const timers = new Map();
  globalThis.window = {
    setTimeout: (callback, ms) => { const id = ++nextTimer; timers.set(id, { callback, ms }); return id; },
    clearTimeout: (id) => timers.delete(id),
  };
  globalThis.chrome = { devtools: { inspectedWindow: { eval: evaluate } } };
  return timers;
}

test("eval startup exceptions release watchdog timers", async () => {
  const timers = host(() => { throw new Error("page disconnected"); });
  await assert.rejects(requestExplainSql(request), /disconnected/);
  assert.equal(timers.size, 0);
});

test("poll failures clean the inspected-page request", async () => {
  let calls = 0;
  let cleaned = false;
  const timers = host((expression, callback) => {
    calls += 1;
    if (calls === 1) callback(true);
    else if (calls === 2) callback(null, { description: "page navigated" });
    else { cleaned = expression.includes("abort()"); callback(true); }
  });
  await assert.rejects(requestExplainSql(request), /导航/);
  assert.equal(timers.size, 0);
  assert.equal(cleaned, true);
});

test("late startup callbacks do not poll after the watchdog settled", async () => {
  let started;
  let polls = 0;
  const timers = host((expression, callback) => {
    if (expression.includes("fetch(")) started = callback;
    else if (expression.includes("abort()")) callback(true);
    else { polls += 1; callback({ done: false }); }
  });
  const pending = requestExplainSql(request);
  const rejected = assert.rejects(pending, /超时/);
  [...timers.values()].find((timer) => timer.ms === 65000).callback();
  await rejected;
  started(true);
  assert.equal(polls, 0);
});

test("inspected fetch retains its timeout until the body finishes", async () => {
  let readBody;
  let config;
  let aborted = false;
  const pageTimers = new Map();
  const pageWindow = {
    setTimeout: (callback) => { pageTimers.set(1, callback); return 1; },
    clearTimeout: (id) => pageTimers.delete(id),
  };
  const context = vm.createContext({
    window: pageWindow,
    AbortController: class { signal = {}; abort() { aborted = true; } },
    fetch: async (url, options) => {
      config = { url, ...options };
      return { ok: true, status: 200, headers: { get: () => "AES" }, text: () => new Promise((resolve) => { readBody = resolve; }) };
    },
  });
  const timers = host((expression, callback) => callback(vm.runInContext(expression, context)));
  const pending = requestExplainSql({ ...request, headers: [
    { name: "Cookie", value: "mock-session" },
    { name: "Sec-Fetch-Site", value: "same-origin" },
    { name: "Host-Context", value: "keep-me" },
  ] });
  await new Promise(setImmediate);
  assert.equal(pageTimers.size, 1, "body download lost its abort timeout");
  readBody('{"data":[{"sql":"SELECT 1"}]}');
  await new Promise(setImmediate);
  [...timers.values()].find((timer) => timer.ms === 150).callback();
  const result = await pending;
  assert.equal(result.encryption, "AES");
  assert.equal(config.url, "https://example.test/api?isExplain=true");
  assert.equal(config.body, request.postData.text);
  assert.equal(config.credentials, "include");
  assert.equal(JSON.stringify(config.headers), JSON.stringify([["Host-Context", "keep-me"]]));
  assert.equal(pageTimers.size, 0);
  assert.equal(Object.keys(pageWindow).some((key) => key.startsWith("__niuniuExplain_")), false);
  assert.equal(aborted, false);
});

test("incomplete bodies and file uploads fail before replay starts", () => {
  host(() => assert.fail("eval must not be called"));
  assert.throws(() => requestExplainSql({ ...request, postData: {} }), /不完整/);
  assert.throws(() => requestExplainSql({ ...request, postData: { params: [{ fileName: "demo.png" }] } }), /文件内容/);
});
