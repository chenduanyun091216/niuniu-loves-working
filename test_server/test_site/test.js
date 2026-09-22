const results = document.getElementById("results");
const runButtons = [...document.querySelectorAll("[data-run]")];

document.cookie = "niuniu_test_session=mock-session; SameSite=Lax; Path=/";

const requests = {
  plain: () => fetch("/api/plain?source=button"),
  table: () => fetch("/api/table?source=button"),
  image: () => fetch("/api/image"),
  encrypted: () => fetch("/api/encrypted?source=button"),
  partial: () => fetch("/api/partial?source=button"),
  base64: () => fetch("/api/base64?filter=MT0x", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      params: JSON.stringify({ columns_sql: "MT0x", org_flag: "MQ==", page_size: "MjA=" }),
      plain: "普通文本保持原样",
    }),
  }),
  echo: () => fetch("/api/echo?source=button", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Demo-Header": "niuniu-test",
    },
    body: JSON.stringify({ name: "小明", task: "接口调试", page: 1 }),
  }),
};

function formatResponse(text) {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

function addResult(method, url, status, text) {
  const card = document.createElement("article");
  card.className = "result-card";
  const header = document.createElement("header");
  const badge = document.createElement("span");
  badge.className = `method ${method === "POST" ? "post" : "get"}`;
  badge.textContent = method;
  const path = document.createElement("code");
  path.className = "result-url";
  path.textContent = url;
  const state = document.createElement("span");
  state.className = `result-status${status >= 400 ? " error" : ""}`;
  state.textContent = `${status} ${status >= 400 ? "Error" : "OK"}`;
  header.append(badge, path, state);
  const body = document.createElement("pre");
  body.textContent = formatResponse(text);
  card.append(header, body);
  results.prepend(card);
}

async function runRequest(name) {
  const request = requests[name];
  const button = document.querySelector(`[data-run="${name}"]`);
  const method = name === "echo" ? "POST" : "GET";
  const url = {
    plain: "/api/plain?source=button",
    table: "/api/table?source=button",
    image: "/api/image",
    encrypted: "/api/encrypted?source=button",
    partial: "/api/partial?source=button",
    base64: "/api/base64?filter=MT0x",
    echo: "/api/echo?source=button",
  }[name];

  if (button) button.disabled = true;
  try {
    const response = await request();
    addResult(method, url, response.status, await response.text());
  } catch (error) {
    addResult(method, url, 0, String(error));
  } finally {
    if (button) button.disabled = false;
  }
}

for (const button of runButtons) {
  button.addEventListener("click", () => runRequest(button.dataset.run));
}

document.getElementById("run-all").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  results.replaceChildren();
  await Promise.all(Object.keys(requests).map(runRequest));
  button.disabled = false;
});

document.getElementById("clear-results").addEventListener("click", () => {
  results.replaceChildren();
  const empty = document.createElement("div");
  empty.className = "empty-state";
  empty.textContent = "还没有请求。选择一个样例，或运行全部样例。";
  results.append(empty);
});
