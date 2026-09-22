const CryptoJS = window.CryptoJS;

export const DEFAULT_AES_KEY = "c5ce58b33c3a018d";
export const DEFAULT_ENCRYPTION_METHOD = "aes-ecb";
export const ENCRYPTION_METHODS = Object.freeze([
  { value: "aes-ecb", label: "AES（ECB / PKCS7）", blockSize: 16, keyLengths: [16, 24, 32] },
  { value: "des-ecb", label: "DES（ECB / PKCS7）", blockSize: 8, keyLengths: [8] },
  { value: "3des-ecb", label: "3DES（ECB / PKCS7）", blockSize: 8, keyLengths: [16, 24] },
  { value: "base64", label: "Base64（仅解码）", keyLengths: [] },
]);

function encryptionMethodConfig(method) {
  return ENCRYPTION_METHODS.find((item) => item.value === method) || ENCRYPTION_METHODS[0];
}

export function getEncryptionMethod(method = DEFAULT_ENCRYPTION_METHOD) {
  return encryptionMethodConfig(method);
}

export function normalizeBase64(input) {
  const compact = String(input ?? "")
    .trim()
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

function readByte(words, index) {
  return (words[index >>> 2] >>> (24 - (index % 4) * 8)) & 0xff;
}

function parseDecryptedText(words, blockSize) {
  const paddingLength = readByte(words.words, words.sigBytes - 1);
  if (paddingLength < 1 || paddingLength > blockSize || paddingLength > words.sigBytes) return null;

  for (let index = words.sigBytes - paddingLength; index < words.sigBytes; index += 1) {
    if (readByte(words.words, index) !== paddingLength) return null;
  }
  words.sigBytes -= paddingLength;

  return CryptoJS.enc.Utf8.stringify(words);
}

export function decrypt(encryptedText, key = DEFAULT_AES_KEY, method = DEFAULT_ENCRYPTION_METHOD) {
  if (!encryptedText) return null;

  const config = encryptionMethodConfig(method);
  if (config.value === "base64") return encryptedText;

  const cipherBase64 = normalizeBase64(encryptedText);
  if (!cipherBase64) return encryptedText;

  try {
    const parsedKey = CryptoJS.enc.Utf8.parse(key);
    const cipherParams = CryptoJS.lib.CipherParams.create({
      ciphertext: CryptoJS.enc.Base64.parse(cipherBase64),
    });
    if (!cipherParams.ciphertext.sigBytes || cipherParams.ciphertext.sigBytes % config.blockSize !== 0) {
      return encryptedText;
    }

    const cipher = config.value === "aes-ecb" ? CryptoJS.AES
      : config.value === "des-ecb" ? CryptoJS.DES
        : CryptoJS.TripleDES;
    const cipherOptions = {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.NoPadding,
    };
    const decryptedWords = cipher.decrypt(cipherParams, parsedKey, cipherOptions);
    const decryptedText = parseDecryptedText(decryptedWords, config.blockSize);
    if (decryptedText === null) return encryptedText;

    const encryptedAgain = cipher.encrypt(decryptedText, parsedKey, {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7,
    }).ciphertext.toString(CryptoJS.enc.Base64);
    if (encryptedAgain !== cipherParams.ciphertext.toString(CryptoJS.enc.Base64)) return encryptedText;

    try {
      return JSON.parse(decryptedText);
    } catch {
      return decryptedText;
    }
  } catch {
    return encryptedText;
  }
}
