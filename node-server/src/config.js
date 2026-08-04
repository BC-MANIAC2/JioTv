// ============================================================
// JioTV Config Fetcher
// The PHP doctor_strange() function fetches a remote config JSON
// from a URL that is hex-encoded → base64 → real URL.
// We replicate the same decoding logic here.
// ============================================================

// Same hex chunks as the PHP doctor_strange() function
const CONFIG_URL_CHUNKS = [
  '6148523063484d364c79396e61584e304c6d647064476831',
  '596e567a5a584a6a623235305a5735304c6d4e766253394b',
  '6158526c626d52795958567559585230615338344d575269',
  '5954637859544d31596d56684f5751354e44646d4f544578',
  '5a6d51315a5759354f54686d4d4339795958637659584270',
  '4c6d707a6232343d',
];

function decodeConfigUrl() {
  const hex = CONFIG_URL_CHUNKS.join('');
  // hex → ASCII string (this gives a base64 string)
  let base64 = '';
  for (let i = 0; i < hex.length; i += 2) {
    base64 += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
  }
  // base64 → real URL
  return atob(base64);
}

const CONFIG_TTL_SECONDS = 3600; // cache for 1 hour

export async function getConfig(env) {
  // Try KV cache first
  try {
    const cached = await env.KV.get('jiotv_config', 'json');
    if (cached) return cached;
  } catch {}

  // Fetch fresh config
  const url = decodeConfigUrl();
  const resp = await fetch(url, {
    headers: { 'Cache-Control': 'no-cache', 'User-Agent': 'JioTV/1.0' },
    cf: { cacheTtl: 0 }
  });

  if (!resp.ok) {
    throw new Error(`Config fetch failed: ${resp.status} from ${url}`);
  }

  const config = await resp.json();

  // Cache in KV
  try {
    await env.KV.put('jiotv_config', JSON.stringify(config), {
      expirationTtl: CONFIG_TTL_SECONDS
    });
  } catch {}

  return config;
}

// Helper: decode hex-encoded API URLs used in the config
// PHP: base64_decode(hex2bin($hex)) → real URL
export function decodeApiUrl(hex) {
  if (!hex) return '';
  let str = '';
  for (let i = 0; i < hex.length; i += 2) {
    str += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
  }
  try {
    return atob(str);
  } catch {
    return str;
  }
}
