import { DEFAULT_AES_KEY, decrypt } from "./crypto.js";

const MAX_DECODE_DEPTH = 64;
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/;

function normalizedBase64(value) {
  const compact = value.trim()
    .replace(/[\t\r\n]/g, "")
    .replace(/ /g, "+")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  if (!compact || !/^[A-Za-z0-9+/]*={0,2}$/.test(compact)) return "";

  const unpadded = compact.replace(/=+$/, "");
  const paddingLength = (4 - unpadded.length % 4) % 4;
  const suppliedPadding = compact.length - unpadded.length;
  if (unpadded.length % 4 === 1 || (suppliedPadding && suppliedPadding !== paddingLength)) return "";
  return unpadded + "=".repeat(paddingLength);
}

function base64Bytes(value) {
  const encoded = normalizedBase64(value);
  if (!encoded) return null;

  try {
    const binary = atob(encoded);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

function isCipherCandidate(value) {
  const bytes = base64Bytes(value);
  return Boolean(bytes && bytes.length >= 16 && bytes.length % 16 === 0);
}

function decodeBase64Text(value) {
  const bytes = base64Bytes(value);
  if (!bytes?.length) return null;

  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return CONTROL_CHARACTERS.test(text) ? null : text;
  } catch {
    return null;
  }
}

function parseStructuredJson(value) {
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[") && !trimmed.startsWith('"')) return null;

  try {
    const parsed = JSON.parse(value);
    return parsed !== null && (typeof parsed === "object" || typeof parsed === "string")
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function decodeNested(value, key, depth = 0) {
  if (depth >= MAX_DECODE_DEPTH) return { value, changed: false };

  if (typeof value === "string") {
    return decodeString(value, key, depth);
  }

  if (Array.isArray(value)) {
    let changed = false;
    const items = value.map((item) => {
      const result = decodeNested(item, key, depth + 1);
      changed ||= result.changed;
      return result.value;
    });
    return changed ? { value: items, changed: true } : { value, changed: false };
  }

  if (value !== null && typeof value === "object") {
    let changed = false;
    const entries = Object.entries(value).map(([name, item]) => {
      const result = decodeNested(item, key, depth + 1);
      changed ||= result.changed;
      return [name, result.value];
    });
    return changed
      ? { value: Object.fromEntries(entries), changed: true }
      : { value, changed: false };
  }

  return { value, changed: false };
}

function decodeString(value, key, depth) {
  if (isCipherCandidate(value)) {
    const decrypted = decrypt(value, key);
    if (decrypted !== value && !(typeof decrypted === "string" && CONTROL_CHARACTERS.test(decrypted))) {
      const nested = decodeNested(decrypted, key, depth + 1);
      return { value: nested.value, changed: true };
    }
  }

  const base64Text = decodeBase64Text(value);
  if (base64Text !== null && base64Text !== value) {
    const parsed = parseStructuredJson(base64Text);
    if (parsed !== null) {
      const nested = decodeNested(parsed, key, depth + 1);
      return { value: nested.value, changed: true };
    }
    return { value: base64Text, changed: true };
  }

  const nestedJson = parseStructuredJson(value);
  if (nestedJson !== null) {
    const nested = decodeNested(nestedJson, key, depth + 1);
    if (nested.changed) return { value: nested.value, changed: true };
  }

  return { value, changed: false };
}

function formatValue(value) {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function isJsonValueString(value) {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

function decryptedResponse(value) {
  return {
    value,
    text: formatValue(value),
    isJson: typeof value !== "string" || isJsonValueString(value),
    decrypted: true,
    label: "已解码",
  };
}

export function decodeDataValue(value, key = DEFAULT_AES_KEY) {
  return decodeNested(value, key);
}

export function decodeResponse(rawText, key = DEFAULT_AES_KEY) {
  let parsed;

  try {
    parsed = JSON.parse(rawText);
  } catch {
    const result = decodeNested(rawText.trim(), key);
    if (result.changed) {
      let value = result.value;
      if (typeof value === "string") {
        try {
          value = JSON.parse(value);
        } catch {
          // A decoded plain-text response is kept as a string.
        }
      }
      return decryptedResponse(value);
    }

    return {
      value: rawText,
      text: rawText,
      isJson: false,
      decrypted: false,
      label: "原始文本",
    };
  }

  const result = decodeNested(parsed, key);
  if (result.changed) return decryptedResponse(result.value);

  return {
    value: parsed,
    text: rawText,
    isJson: true,
    decrypted: false,
    label: "JSON",
  };
}
