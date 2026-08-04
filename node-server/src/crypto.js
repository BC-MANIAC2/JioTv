// ============================================================
// AES-128-CBC encrypt/decrypt using Web Crypto API
// Matches PHP: openssl_encrypt($data, 'aes-128-cbc', KEY, OPENSSL_RAW_DATA, IV)
// Key and IV are both "JITENDRA_KUMAR_U" (16 bytes UTF-8)
// PHP stores as bin2hex(encrypted) — so output/input is hex string
// ============================================================

const KEY_STR = 'JITENDRA_KUMAR_U';
const IV_STR  = 'JITENDRA_KUMAR_U';

function strToBytes(str) {
  return new TextEncoder().encode(str);
}

function hexToBytes(hex) {
  if (!hex || hex.length % 2 !== 0) return new Uint8Array(0);
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function getCryptoKey(usage) {
  return crypto.subtle.importKey(
    'raw',
    strToBytes(KEY_STR),
    { name: 'AES-CBC' },
    false,
    [usage]
  );
}

// Encrypt: string → hex string (matches PHP bin2hex(openssl_encrypt(...)))
export async function encrypt(data) {
  if (!data) return '';
  try {
    const key = await getCryptoKey('encrypt');
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-CBC', iv: strToBytes(IV_STR) },
      key,
      strToBytes(String(data))
    );
    return bytesToHex(encrypted);
  } catch (e) {
    console.error('Encrypt error:', e);
    return '';
  }
}

// Decrypt: hex string → original string (matches PHP openssl_decrypt(hex2bin(...)))
export async function decrypt(hexData) {
  if (!hexData || typeof hexData !== 'string' || hexData.length === 0) return null;
  try {
    const key = await getCryptoKey('decrypt');
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-CBC', iv: strToBytes(IV_STR) },
      key,
      hexToBytes(hexData)
    );
    return new TextDecoder().decode(decrypted);
  } catch (e) {
    // Decryption failed — likely invalid/tampered data
    return null;
  }
}
