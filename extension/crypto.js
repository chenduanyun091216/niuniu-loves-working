const CryptoJS = window.CryptoJS

// 👇 这两个必须和后端完全一致！
export const DEFAULT_AES_KEY = 'c5ce58b33c3a018d' // 后端给你
const AES_KEY = DEFAULT_AES_KEY

export function normalizeBase64(input) {
  let s = String(input || '').trim()

  // 常见传输污染：+ 被变成空格
  s = s.replace(/ /g, '+')

  // 兼容 URL-safe Base64
  s = s.replace(/-/g, '+').replace(/_/g, '/')

  // 自动补齐 =
  const mod = s.length % 4
  if (mod) s += '='.repeat(4 - mod)

  return s
}
// 加时间戳，用作bda-req-spell的header的值
export function evalTimerForHeader() {
  const AES_KEY = "BOkmioWq/5jhnvlwM50t4g==";
  // 获取当前毫秒级时间戳
  const timestamp = new Date().getTime();
  const combined = timestamp;
  const key = CryptoJS.enc.Utf8.parse(AES_KEY);
  const content = CryptoJS.enc.Utf8.parse(combined);
  // 对齐后端：AES/ECB/PKCS5Padding
  const encrypted = CryptoJS.AES.encrypt(content, key, {
    mode: CryptoJS.mode.ECB,
    padding: CryptoJS.pad.Pkcs7,
  })
  return encrypted.toString();
}

/**
 * AES 加密
 * @param {*} data - 要加密的数据（对象会自动 JSON.stringify）
 * @returns {string} Base64 编码的密文
 */
export function encrypt(data) {
  if (data === null || data === undefined) return ''

  try {
    // 如果是对象，先序列化
    const plainText = typeof data === 'object' ? JSON.stringify(data) : String(data)

    const key = CryptoJS.enc.Utf8.parse(AES_KEY)

    // 对齐后端：AES/ECB/PKCS5Padding
    const encrypted = CryptoJS.AES.encrypt(plainText, key, {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7,
    })

    // 返回标准 Base64
    return encrypted.ciphertext.toString(CryptoJS.enc.Base64)
  } catch (e) {
    console.error('AES 加密失败：', e)
    return ''
  }
}

/**
 * AES 加密
 * @param {*} data - 要加密的数据（对象会自动 JSON.stringify）
 * @param {*} KEY - AES_KEY
 * @returns {string} Base64 编码的密文
 */
export function encryptAES(KEY, data) {
  if (data === null || data === undefined) return ''

  try {
    // 如果是对象，先序列化
    const plainText = typeof data === 'object' ? JSON.stringify(data) : String(data)

    const key = CryptoJS.enc.Utf8.parse(KEY)

    // 对齐后端：AES/ECB/PKCS5Padding
    const encrypted = CryptoJS.AES.encrypt(plainText, key, {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7,
    })

    // 返回标准 Base64
    return encrypted.ciphertext.toString(CryptoJS.enc.Base64)
  } catch (e) {
    console.error('AES 加密失败：', e)
    return ''
  }
}

/**
 * AES 解密
 * @param {string} encryptedStr - Base64 编码的密文
 * @returns {*} 解密后的数据（自动尝试 JSON.parse）
 */
export function decrypt(encryptedStr, key = DEFAULT_AES_KEY) {
  if (!encryptedStr) return null

  const cipherBase64 = normalizeBase64(encryptedStr)
  try {
    const parsedKey = CryptoJS.enc.Utf8.parse(key)
    const cipherParams = CryptoJS.lib.CipherParams.create({
      ciphertext: CryptoJS.enc.Base64.parse(cipherBase64),
    })

    // 对齐后端：AES/ECB/PKCS5Padding（用 Pkcs7，16字节块下等价）
    if (!cipherParams.ciphertext.sigBytes || cipherParams.ciphertext.sigBytes % 16 !== 0) {
      return encryptedStr
    }

    const decryptedWords = CryptoJS.AES.decrypt(cipherParams, parsedKey, {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.NoPadding,
    })
    const paddingIndex = decryptedWords.sigBytes - 1
    const paddingLength = (decryptedWords.words[paddingIndex >>> 2] >>> (24 - (paddingIndex % 4) * 8)) & 0xff
    if (paddingLength < 1 || paddingLength > 16 || paddingLength > decryptedWords.sigBytes) {
      return encryptedStr
    }
    for (let index = decryptedWords.sigBytes - paddingLength; index < decryptedWords.sigBytes; index += 1) {
      const byte = (decryptedWords.words[index >>> 2] >>> (24 - (index % 4) * 8)) & 0xff
      if (byte !== paddingLength) return encryptedStr
    }
    decryptedWords.sigBytes -= paddingLength

    const decryptedText = CryptoJS.enc.Utf8.stringify(decryptedWords)
    const encryptedAgain = CryptoJS.AES.encrypt(decryptedText, parsedKey, {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7,
    }).ciphertext.toString(CryptoJS.enc.Base64)
    if (encryptedAgain !== cipherParams.ciphertext.toString(CryptoJS.enc.Base64)) {
      return encryptedStr
    }
    try {
      return JSON.parse(decryptedText)
    } catch {
      return decryptedText
    }
  } catch (e) {
    console.error('AES 解密失败：', e)
    return encryptedStr
  }
}

/**
 * AES 解密
 * @param {string} encryptedStr - Base64 编码的密文
 * @param {*} KEY - AES_KEY
 * @returns {*} 解密后的数据（自动尝试 JSON.parse）
 */
export function decryptAES(KEY, encryptedStr) {
  if (!encryptedStr) return null

  const cipherBase64 = normalizeBase64(encryptedStr)
  try {
    const key = CryptoJS.enc.Utf8.parse(KEY)
    const cipherParams = CryptoJS.lib.CipherParams.create({
      ciphertext: CryptoJS.enc.Base64.parse(cipherBase64),
    })

    // 对齐后端：AES/ECB/PKCS5Padding（用 Pkcs7，16字节块下等价）
    const decryptedWords = CryptoJS.AES.decrypt(cipherParams, key, {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7,
    })

    const decryptedText = CryptoJS.enc.Utf8.stringify(decryptedWords)
    if (!decryptedText) {
      console.log('解密结果为空，可能密钥不匹配或密文损坏')
    }

    try {
      return JSON.parse(decryptedText)
    } catch {
      return decryptedText
    }
  } catch (e) {
    console.error('AES 解密失败：', e)
    return encryptedStr
  }
}
window.decryptAES = decryptAES
window.encryptAES = encryptAES
