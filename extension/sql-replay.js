export function explainRequestUrl(requestUrl) {
  const url = new URL(requestUrl);
  url.searchParams.set("isExplain", "true");
  return url.href;
}

// Serialized into the inspected page; keep this function independent of module scope.
function startInspectedFetch(config, key) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 60000);
  const pending = { done: false, controller, timeout };
  window[key] = pending;
  fetch(config.url, {
    method: config.method,
    headers: config.headers,
    body: config.body,
    credentials: "include",
    signal: controller.signal,
  }).then(async (response) => {
    const text = await response.text();
    if (window[key] !== pending) return;
    window.clearTimeout(timeout);
    window[key] = {
      done: true,
      ok: response.ok,
      status: response.status,
      encryption: response.headers.get("X-Data-Encrypted") || "",
      text,
    };
  }).catch((error) => {
    if (window[key] !== pending) return;
    window.clearTimeout(timeout);
    window[key] = {
      done: true,
      error: error?.name === "AbortError"
        ? "解释请求超时，请检查接口响应或页面跨域策略。"
        : String(error),
    };
  });
  return true;
}

export function requestExplainSql(request) {
  const method = String(request.method || "GET").toUpperCase();
  const postData = request.postData;
  if (postData?.params?.some((param) => param.fileName)) {
    throw new Error("当前请求包含无法从 DevTools 记录中重放的文件内容。");
  }
  if (postData && typeof postData.text !== "string") {
    throw new Error("当前请求的表单 body 不完整，无法保证参数一致。");
  }

  const excludedHeaders = /^(?:(?:accept-encoding|connection|content-length|cookie|host|origin|referer)$|sec-|:)/i;
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
  const expression = `(${startInspectedFetch.toString()})(JSON.parse(${configLiteral}), ${tokenLiteral})`;
  const pollExpression = `(() => { const result = window[${tokenLiteral}]; if (!result) return null; if (!result.done) return { done: false }; delete window[${tokenLiteral}]; return result; })()`;
  const cleanupExpression = `(() => { const result = window[${tokenLiteral}]; if (result?.timeout !== undefined) window.clearTimeout(result.timeout); result?.controller?.abort(); delete window[${tokenLiteral}]; return true; })()`;

  return new Promise((resolve, reject) => {
    let settled = false;
    let pollTimer = null;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(watchdog);
      if (pollTimer !== null) window.clearTimeout(pollTimer);
      if (error) {
        try {
          chrome.devtools.inspectedWindow.eval(cleanupExpression, () => {});
        } catch {
          // The inspected page may already be gone.
        }
        reject(error);
      } else {
        resolve(result);
      }
    };
    const watchdog = window.setTimeout(() => {
      finish(new Error("解释请求超时，请检查接口响应或页面跨域策略。"));
    }, 65000);
    const evaluate = (code, callback) => {
      if (settled) return;
      try {
        chrome.devtools.inspectedWindow.eval(code, (...args) => {
          if (!settled) callback(...args);
        });
      } catch (error) {
        finish(error);
      }
    };
    const poll = () => evaluate(pollExpression, (result, exception) => {
      if (exception || !result) {
        finish(new Error("无法读取解释请求结果；页面可能已导航。"));
      } else if (result.done) {
        if (result.error) finish(new Error(`解释请求失败：${result.error}`));
        else if (!result.ok) finish(new Error(`解释接口返回 HTTP ${result.status}：${String(result.text || "").slice(0, 300)}`));
        else finish(null, { text: result.text, encryption: result.encryption });
      } else {
        pollTimer = window.setTimeout(poll, 150);
      }
    });

    evaluate(expression, (started, exception) => {
      if (exception || !started) {
        finish(new Error(exception?.value || exception?.description || "无法在当前页面启动解释请求。"));
        return;
      }
      poll();
    });
  });
}
