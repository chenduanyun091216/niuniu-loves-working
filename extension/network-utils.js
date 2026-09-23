export function responseHeader(entry, name) {
  return entry.response?.headers?.find((item) => (item.name || "").toLowerCase() === name.toLowerCase())?.value || "";
}

export function responseMimeType(entry) {
  const contentType = entry.response?.content?.mimeType || "";
  return (responseHeader(entry, "content-type") || contentType).toLowerCase();
}

export function requestResourceType(entry) {
  const type = String(entry._resourceType || entry.type || "").toLowerCase();
  if (type === "xhr" || type === "fetch") return "fetch-xhr";
  if (["document", "stylesheet", "script", "font", "image", "media", "manifest", "websocket", "wasm"].includes(type)) {
    return type;
  }
  return "other";
}

export function requestIdentity(entry) {
  const requestId = entry._requestId || entry.requestId;
  if (requestId) return `id:${requestId}`;

  const request = entry.request || {};
  return [
    entry.startedDateTime || "",
    request.method || "GET",
    request.url || "",
    entry.time ?? "",
    entry.response?.status ?? "",
  ].join("\u0001");
}

export function requestName(url) {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    return `${segments[segments.length - 1] || parsed.host}${parsed.search}`;
  } catch {
    return url;
  }
}

export function isExplainRequest(url) {
  try {
    return new URL(url).searchParams.getAll("isExplain").includes("true");
  } catch {
    return false;
  }
}

export function isTextMimeType(mimeType) {
  const type = mimeType.split(";", 1)[0].trim();
  return /^(text\/|application\/(json|javascript|xml|graphql|x-www-form-urlencoded)$|image\/svg\+xml$)/i.test(type)
    || /\+(json|xml)$/i.test(type);
}

export function isFileResponse(entry) {
  const resourceType = requestResourceType(entry);
  if (["image", "media", "font", "wasm"].includes(resourceType)) return true;
  if (/\battachment\b/i.test(responseHeader(entry, "content-disposition"))) return true;

  const mimeType = responseMimeType(entry);
  if (/^application\/[^;]+\+(json|xml)(?:\s*;|$)/i.test(mimeType)) return false;
  return /^(image|audio|video|font)\//.test(mimeType)
    || /^(text\/(csv|tab-separated-values)|application\/(octet-stream|pdf|zip|gzip|x-7z-compressed|x-rar-compressed|msword|vnd\.))/.test(mimeType);
}

export function hasJsonResponse(entry) {
  const mimeType = responseMimeType(entry);
  return !mimeType || /json|graphql/.test(mimeType);
}
