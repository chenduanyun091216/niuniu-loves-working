const CryptoJS = window.CryptoJS;

export const DEFAULT_AES_KEY = "c5ce58b33c3a018d";

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

function parseDecryptedText(words) {
  const paddingLength = readByte(words.words, words.sigBytes - 1);
  if (paddingLength < 1 || paddingLength > 16 || paddingLength > words.sigBytes) return null;

  for (let index = words.sigBytes - paddingLength; index < words.sigBytes; index += 1) {
    if (readByte(words.words, index) !== paddingLength) return null;
  }
  words.sigBytes -= paddingLength;

  return CryptoJS.enc.Utf8.stringify(words);
}

export function decrypt(encryptedText, key = DEFAULT_AES_KEY) {
  if (!encryptedText) return null;

  const cipherBase64 = normalizeBase64(encryptedText);
  if (!cipherBase64) return encryptedText;

  try {
    const parsedKey = CryptoJS.enc.Utf8.parse(key);
    const cipherParams = CryptoJS.lib.CipherParams.create({
      ciphertext: CryptoJS.enc.Base64.parse(cipherBase64),
    });
    if (!cipherParams.ciphertext.sigBytes || cipherParams.ciphertext.sigBytes % 16 !== 0) {
      return encryptedText;
    }

    const decryptedWords = CryptoJS.AES.decrypt(cipherParams, parsedKey, {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.NoPadding,
    });
    const decryptedText = parseDecryptedText(decryptedWords);
    if (decryptedText === null) return encryptedText;

    const encryptedAgain = CryptoJS.AES.encrypt(decryptedText, parsedKey, {
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
