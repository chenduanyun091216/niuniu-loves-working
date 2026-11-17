import {
  DEFAULT_AES_KEY,
  DEFAULT_ENCRYPTION_METHOD,
  decrypt,
  getEncryptionMethod,
  normalizeBase64,
} from "./crypto.js";

const MAX_DECODE_DEPTH = 64;
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/;

function base64Bytes(value) {
  const encoded = normalizeBase64(value);
  if (!encoded) return null;

  try {
    const binary = atob(encoded);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

function isCipherCandidate(value, method) {
  const bytes = base64Bytes(value);
  const blockSize = getEncryptionMethod(method).blockSize;
  return Boolean(blockSize && bytes && bytes.length >= blockSize && bytes.length % blockSize === 0);
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
    return parseLooseStructuredValue(trimmed);
  }
}

function parseLooseStructuredValue(source) {
  let index = 0;

  function skipWhitespace() {
    while (/\s/.test(source[index] || "")) index += 1;
  }

  function parseString() {
    const quote = source[index++];
    let result = "";
    while (index < source.length) {
      const character = source[index++];
      if (character === quote) return result;
      if (character !== "\\") {
        result += character;
        continue;
      }
      const escaped = source[index++];
      const escapes = { b: "\b", f: "\f", n: "\n", r: "\r", t: "\t", v: "\v" };
      result += escapes[escaped] ?? escaped;
    }
    throw new Error("Unterminated string");
  }

  function parseValue() {
    skipWhitespace();
    const character = source[index];
    if (character === "'" || character === '"') return parseString();
    if (character === "{") return parseObject();
    if (character === "[") return parseArray();

    const token = source.slice(index).match(/^(true|false|null|True|False|None|-?(?:\d+\.?\d*|\.\d+))/)?.[0];
    if (!token) throw new Error("Invalid value");
    index += token.length;
    if (token === "true" || token === "True") return true;
    if (token === "false" || token === "False") return false;
    if (token === "null" || token === "None") return null;
    return Number(token);
  }

  function parseObject() {
    const result = {};
    index += 1;
    skipWhitespace();
    if (source[index] === "}") {
      index += 1;
      return result;
    }
    while (index < source.length) {
      skipWhitespace();
      if (source[index] !== "'" && source[index] !== '"') throw new Error("Invalid object key");
      const key = parseString();
      skipWhitespace();
      if (source[index++] !== ":") throw new Error("Missing object separator");
      Object.defineProperty(result, key, {
        value: parseValue(),
        enumerable: true,
        configurable: true,
        writable: true,
      });
      skipWhitespace();
      if (source[index] === "}") {
        index += 1;
        return result;
      }
      if (source[index++] !== ",") throw new Error("Missing object delimiter");
    }
    throw new Error("Unterminated object");
  }

  function parseArray() {
    const result = [];
    index += 1;
    skipWhitespace();
    if (source[index] === "]") {
      index += 1;
      return result;
    }
    while (index < source.length) {
      result.push(parseValue());
      skipWhitespace();
      if (source[index] === "]") {
        index += 1;
        return result;
      }
      if (source[index++] !== ",") throw new Error("Missing array delimiter");
    }
    throw new Error("Unterminated array");
  }

  try {
    const parsed = parseValue();
    skipWhitespace();
    return index === source.length && parsed !== null && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function decodeNested(value, key, method = DEFAULT_ENCRYPTION_METHOD, depth = 0) {
  if (depth >= MAX_DECODE_DEPTH) return { value, changed: false };

  if (typeof value === "string") {
    return decodeString(value, key, method, depth);
  }

  if (Array.isArray(value)) {
    let changed = false;
    const items = value.map((item) => {
      const result = decodeNested(item, key, method, depth + 1);
      changed ||= result.changed;
      return result.value;
    });
    return changed ? { value: items, changed: true } : { value, changed: false };
  }

  if (value !== null && typeof value === "object") {
    let changed = false;
    const entries = Object.entries(value).map(([name, item]) => {
      const result = decodeNested(item, key, method, depth + 1);
      changed ||= result.changed;
      return [name, result.value];
    });
    return changed
      ? { value: Object.fromEntries(entries), changed: true }
      : { value, changed: false };
  }

  return { value, changed: false };
}

function decodeString(value, key, method, depth) {
  if (isCipherCandidate(value, method)) {
    const decrypted = decrypt(value, key, method);
    if (decrypted !== value && !(typeof decrypted === "string" && CONTROL_CHARACTERS.test(decrypted))) {
      const nested = decodeNested(decrypted, key, method, depth + 1);
      return { value: nested.value, changed: true };
    }
  }

  const base64Text = decodeBase64Text(value);
  if (base64Text !== null && base64Text !== value) {
    const parsed = parseStructuredJson(base64Text);
    if (parsed !== null) {
      const nested = decodeNested(parsed, key, method, depth + 1);
      return { value: nested.value, changed: true };
    }
    return { value: base64Text, changed: true };
  }

  const nestedJson = parseStructuredJson(value);
  if (nestedJson !== null) {
    const nested = decodeNested(nestedJson, key, method, depth + 1);
    return { value: nested.value, changed: true };
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

export function decodeDataValue(value, key = DEFAULT_AES_KEY, options = {}) {
  return decodeNested(value, key, options.method || DEFAULT_ENCRYPTION_METHOD);
}

export function decodeResponse(rawText, key = DEFAULT_AES_KEY, options = {}) {
  const method = String(options.encryption || "").trim().toUpperCase() === "AES"
    ? "aes-ecb"
    : options.method || DEFAULT_ENCRYPTION_METHOD;
  let parsed;

  try {
    parsed = JSON.parse(rawText);
  } catch {
    const result = decodeString(rawText.trim(), key, method, 0);
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

  const result = decodeNested(parsed, key, method);
  if (result.changed) return decryptedResponse(result.value);

  return {
    value: parsed,
    text: rawText,
    isJson: true,
    decrypted: false,
    label: "JSON",
  };
}
