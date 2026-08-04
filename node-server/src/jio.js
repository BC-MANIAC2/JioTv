// ============================================================
// JioTV HTTP Client
// Mirrors PHP's jitendraunatti() function — the core HTTP engine
// that handles all calls to JioTV's API with proper headers.
// ============================================================

// Convert PHP-style headers array ["Name: value", ...] to JS Headers object
function buildHeaders(headersArray) {
  const h = {};
  if (!headersArray || headersArray === 0) return h;

  if (Array.isArray(headersArray)) {
    for (const header of headersArray) {
      if (!header || typeof header !== 'string') continue;
      const idx = header.indexOf(': ');
      if (idx > 0) {
        const name  = header.slice(0, idx).toLowerCase().trim();
        const value = header.slice(idx + 2).trim();
        if (name && value) h[name] = value;
      }
    }
  } else if (typeof headersArray === 'object') {
    for (const [k, v] of Object.entries(headersArray)) {
      h[k.toLowerCase()] = String(v);
    }
  }
  return h;
}

// Main fetch wrapper — equivalent to PHP jitendraunatti()
// Returns { data: string, dataBuffer: ArrayBuffer, info: {http_code}, responseHeaders: {} }
export async function jioFetch(url, headers = [], method = 'GET', body = null) {
  const fetchHeaders = buildHeaders(headers);

  const options = { method, headers: fetchHeaders };
  if (body !== null && body !== undefined) {
    options.body = body;
  }

  let response;
  try {
    response = await fetch(url, options);
  } catch (e) {
    return {
      data: '',
      dataBuffer: new ArrayBuffer(0),
      info: { http_code: 0, content_type: '' },
      responseHeaders: {},
    };
  }

  // Collect response headers
  const responseHeaders = {};
  response.headers.forEach((value, key) => {
    responseHeaders[key.toLowerCase()] = value;
  });

  // Read body as ArrayBuffer (works for both text and binary)
  const dataBuffer = await response.arrayBuffer();
  const data = new TextDecoder('utf-8', { fatal: false }).decode(dataBuffer);

  return {
    data,
    dataBuffer,
    info: {
      http_code: response.status,
      content_type: responseHeaders['content-type'] || '',
    },
    responseHeaders,
  };
}

// Convenience: fetch and parse JSON response
export async function jioFetchJSON(url, headers = [], method = 'GET', body = null) {
  const result = await jioFetch(url, headers, method, body);
  try {
    return { json: JSON.parse(result.data), info: result.info };
  } catch {
    return { json: null, info: result.info };
  }
}
