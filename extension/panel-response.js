import { decodeResponse } from "./response-utils.js";
import { isTextMimeType, responseHeader, responseMimeType } from "./network-utils.js";

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

  if (typeof content !== "string") {
    setBodyError(record, "无法读取响应正文。");
    return;
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
    setBodyError(record, "响应内容不是可显示的文本。");
  }
}

function setBodyError(record, message) {
  record.bodyText = "";
  record.bodyBase64 = null;
  record.bodyEncoding = "";
  record.bodyReady = true;
  record.bodyError = message;
  record.decoded = null;
}

export function loadLiveContent(record, request, onChange) {
  const complete = (content, encoding) => {
    setResponseContent(record, content, encoding);
    onChange(record);
  };
  const fail = () => {
    setBodyError(record, "无法读取响应正文。");
    onChange(record);
  };
  if (typeof request.getContent !== "function") {
    const content = request.response?.content;
    if (typeof content?.text === "string") {
      complete(content.text, content.encoding);
      return;
    }
    fail();
    return;
  }

  try {
    request.getContent(complete);
  } catch {
    fail();
  }
}

export function responseFor(record, { rawMode, key, method }) {
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
  record.decoded ??= decodeResponse(record.bodyText || "", key, {
    method,
    encryption: responseHeader(record.entry, "x-data-encrypted"),
  });
  return record.decoded;
}

