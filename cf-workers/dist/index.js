var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/config.js
var CONFIG_URL_CHUNKS = [
  "6148523063484d364c79396e61584e304c6d647064476831",
  "596e567a5a584a6a623235305a5765304c6d4e766253394a",
  "6158526c626d52795958567559585230615338344d574a69",
  "5954637859544d31596d56684f5751354e44646d4f544578",
  "5a6d51315a5759354f54686d4d4379795958637659584270",
  "4c6d707a6232343d"
];
function decodeConfigUrl() {
  const hex = CONFIG_URL_CHUNKS.join("");
  let base64 = "";
  for (let i = 0; i < hex.length; i += 2) {
    base64 += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
  }
  return atob(base64);
}
__name(decodeConfigUrl, "decodeConfigUrl");
var CONFIG_TTL_SECONDS = 3600;
async function getConfig(env) {
  try {
    const cached = await env.KV.get("jiotv_config", "json");
    if (cached)
      return cached;
  } catch {
  }
  const url = decodeConfigUrl();
  const resp = await fetch(url, {
    headers: { "Cache-Control": "no-cache", "User-Agent": "JioTV/1.0" },
    cf: { cacheTtl: 0 }
  });
  if (!resp.ok) {
    throw new Error(`Config fetch failed: ${resp.status} from ${url}`);
  }
  const config = await resp.json();
  try {
    await env.KV.put("jiotv_config", JSON.stringify(config), {
      expirationTtl: CONFIG_TTL_SECONDS
    });
  } catch {
  }
  return config;
}
__name(getConfig, "getConfig");
function decodeApiUrl(hex) {
  if (!hex)
    return "";
  let str = "";
  for (let i = 0; i < hex.length; i += 2) {
    str += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
  }
  try {
    return atob(str);
  } catch {
    return str;
  }
}
__name(decodeApiUrl, "decodeApiUrl");

// src/crypto.js
var KEY_STR = "JITENDRA_KUMAR_U";
var IV_STR = "JITENDRA_KUMAR_U";
function strToBytes(str) {
  return new TextEncoder().encode(str);
}
__name(strToBytes, "strToBytes");
function hexToBytes(hex) {
  if (!hex || hex.length % 2 !== 0)
    return new Uint8Array(0);
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
__name(hexToBytes, "hexToBytes");
function bytesToHex(buffer) {
  return Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(bytesToHex, "bytesToHex");
async function getCryptoKey(usage) {
  return crypto.subtle.importKey(
    "raw",
    strToBytes(KEY_STR),
    { name: "AES-CBC" },
    false,
    [usage]
  );
}
__name(getCryptoKey, "getCryptoKey");
async function encrypt(data) {
  if (!data)
    return "";
  try {
    const key = await getCryptoKey("encrypt");
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-CBC", iv: strToBytes(IV_STR) },
      key,
      strToBytes(String(data))
    );
    return bytesToHex(encrypted);
  } catch (e) {
    console.error("Encrypt error:", e);
    return "";
  }
}
__name(encrypt, "encrypt");
async function decrypt(hexData) {
  if (!hexData || typeof hexData !== "string" || hexData.length === 0)
    return null;
  try {
    const key = await getCryptoKey("decrypt");
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-CBC", iv: strToBytes(IV_STR) },
      key,
      hexToBytes(hexData)
    );
    return new TextDecoder().decode(decrypted);
  } catch (e) {
    return null;
  }
}
__name(decrypt, "decrypt");

// src/session.js
var COOKIE_NAME = "jiotv_sess";
var SESSION_TTL = 30 * 24 * 3600;
function makeSessionId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(makeSessionId, "makeSessionId");
function getSessionId(request) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([a-f0-9]{32})`));
  return match ? match[1] : null;
}
__name(getSessionId, "getSessionId");
async function getSession(request, env) {
  const sessionId = getSessionId(request);
  if (!sessionId)
    return null;
  const raw = await env.KV.get(`sess_${sessionId}`);
  if (!raw)
    return null;
  const json2 = await decrypt(raw);
  if (!json2)
    return null;
  try {
    return JSON.parse(json2);
  } catch {
    return null;
  }
}
__name(getSession, "getSession");
async function createSession(data, env) {
  const sessionId = makeSessionId();
  const encrypted = await encrypt(JSON.stringify(data));
  await env.KV.put(`sess_${sessionId}`, encrypted, { expirationTtl: SESSION_TTL });
  return sessionId;
}
__name(createSession, "createSession");
async function deleteSession(request, env) {
  const sessionId = getSessionId(request);
  if (sessionId) {
    await env.KV.delete(`sess_${sessionId}`);
  }
}
__name(deleteSession, "deleteSession");
function buildSetCookie(sessionId, maxAge = SESSION_TTL) {
  return `${COOKIE_NAME}=${sessionId}; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=${maxAge}`;
}
__name(buildSetCookie, "buildSetCookie");
function buildClearCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}
__name(buildClearCookie, "buildClearCookie");

// src/jio.js
function buildHeaders(headersArray) {
  const h = {};
  if (!headersArray || headersArray === 0)
    return h;
  if (Array.isArray(headersArray)) {
    for (const header of headersArray) {
      if (!header || typeof header !== "string")
        continue;
      const idx = header.indexOf(": ");
      if (idx > 0) {
        const name = header.slice(0, idx).toLowerCase().trim();
        const value = header.slice(idx + 2).trim();
        if (name && value)
          h[name] = value;
      }
    }
  } else if (typeof headersArray === "object") {
    for (const [k, v] of Object.entries(headersArray)) {
      h[k.toLowerCase()] = String(v);
    }
  }
  return h;
}
__name(buildHeaders, "buildHeaders");
async function jioFetch(url, headers = [], method = "GET", body = null) {
  const fetchHeaders = buildHeaders(headers);
  const options = { method, headers: fetchHeaders };
  if (body !== null && body !== void 0) {
    options.body = body;
  }
  let response;
  try {
    response = await fetch(url, options);
  } catch (e) {
    return {
      data: "",
      dataBuffer: new ArrayBuffer(0),
      info: { http_code: 0, content_type: "" },
      responseHeaders: {}
    };
  }
  const responseHeaders = {};
  response.headers.forEach((value, key) => {
    responseHeaders[key.toLowerCase()] = value;
  });
  const dataBuffer = await response.arrayBuffer();
  const data = new TextDecoder("utf-8", { fatal: false }).decode(dataBuffer);
  return {
    data,
    dataBuffer,
    info: {
      http_code: response.status,
      content_type: responseHeaders["content-type"] || ""
    },
    responseHeaders
  };
}
__name(jioFetch, "jioFetch");

// src/auth.js
function makeDeviceId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(8))).map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(makeDeviceId, "makeDeviceId");
async function sendOTP(mobile, config, env) {
  const body = JSON.stringify({ number: btoa("+91" + mobile) });
  const headers = [
    "User-Agent: " + (config.api_endpoint_static_value?.["User-Agent-OkHttp"] || ""),
    "appname: " + (config.api_endpoint_static_value?.appName || ""),
    "os: " + (config.api_endpoint_static_value?.os || ""),
    "m-rating: " + (config.api_endpoint_static_value?.["m-rating"] || ""),
    "devicetype: " + (config.api_endpoint_static_value?.deviceType || ""),
    "content-type: application/json; charset=utf-8"
  ];
  const url = decodeApiUrl(config.jiotv_api?.send);
  const result = await jioFetch(url, headers, "POST", body);
  if (result.info.http_code === 204) {
    await env.KV.put("otp_mobile", mobile, { expirationTtl: 600 });
    return { message: "SUCCESS", ui_label: "OTP Sent Successfully \u2705" };
  }
  let json2 = {};
  try {
    json2 = JSON.parse(result.data);
  } catch {
  }
  const code = json2.code ?? 0;
  const errorMap = {
    1042: { message: "INVALID_SESSION", ui_label: "Session expired, please refresh \u274C" },
    1002: { message: "USER_NOT_FOUND", ui_label: "Number not registered with Jio \u274C" },
    1040: { message: "RATE_LIMIT", ui_label: "Too many attempts. Wait 15 minutes \u274C" }
  };
  return errorMap[code] ?? {
    message: "API_ERROR",
    ui_label: (json2.message ?? "Connection error") + " \u274C"
  };
}
__name(sendOTP, "sendOTP");
async function expireAllUsers(tempToken, deviceId, config) {
  const body = JSON.stringify({
    appName: config.api_endpoint_static_value?.appName || "",
    deviceId
  });
  const headers = [
    "User-Agent: " + (config.api_endpoint_static_value?.["User-Agent-OkHttp"] || ""),
    "x-platform: " + (config.api_endpoint_static_value?.["x-platform"] || ""),
    "temptoken: " + tempToken,
    "content-type: application/json; charset=utf-8"
  ];
  const url = decodeApiUrl(config.jiotv_api?.expireallusers);
  const result = await jioFetch(url, headers, "POST", body);
  try {
    return JSON.parse(result.data);
  } catch {
    return null;
  }
}
__name(expireAllUsers, "expireAllUsers");
async function verifyOTP(otp, config, env) {
  const mobile = await env.KV.get("otp_mobile");
  if (!mobile) {
    return { message: "EXPIRED", ui_label: "Session expired. Please re-enter your number \u274C" };
  }
  const deviceId = makeDeviceId();
  const body = JSON.stringify({
    number: btoa("+91" + mobile),
    otp,
    deviceInfo: {
      consumptionDeviceName: config.api_endpoint_static_value?.devicename || "JioTV",
      info: {
        type: config.api_endpoint_static_value?.os || "android",
        platform: { name: config.api_endpoint_static_value?.["p-Name"] || "Android" },
        androidId: deviceId
      }
    }
  });
  const headers = [
    "User-Agent: " + (config.api_endpoint_static_value?.["User-Agent-OkHttp"] || ""),
    "appname: " + (config.api_endpoint_static_value?.appName || ""),
    "os: " + (config.api_endpoint_static_value?.os || ""),
    "devicetype: " + (config.api_endpoint_static_value?.deviceType || ""),
    "content-type: application/json; charset=utf-8"
  ];
  const url = decodeApiUrl(config.jiotv_api?.verify);
  const result = await jioFetch(url, headers, "POST", body);
  let json2 = {};
  try {
    json2 = JSON.parse(result.data);
  } catch {
  }
  if (json2.code === 200 && json2.data?.tempToken && !json2.data?.authToken) {
    const targetDeviceId = json2.data.deviceId ?? deviceId;
    const newTokens = await expireAllUsers(json2.data.tempToken, targetDeviceId, config);
    if (newTokens?.data?.authToken) {
      json2.data.authToken = newTokens.data.authToken;
      json2.data.refreshToken = newTokens.data.refreshToken;
      json2.data.ssoToken = newTokens.data.ssoToken;
    }
  }
  if (json2.code === 200 && json2.data?.authToken) {
    await env.KV.delete("otp_mobile");
    return {
      message: "SUCCESS",
      ui_label: "Logged in Successfully \u2705",
      sessionData: { ...json2.data, deviceId: json2.data.deviceId || deviceId }
    };
  }
  if (json2.code === 1043) {
    return { message: "INVALID_OTP", ui_label: "Incorrect OTP \u274C" };
  }
  return { message: "AUTH_ERROR", ui_label: (json2.message ?? "Verification failed") + " \u274C" };
}
__name(verifyOTP, "verifyOTP");
async function getValidToken(sessionData, config) {
  const currentToken = sessionData?.authToken;
  if (currentToken) {
    try {
      const parts = currentToken.split(".");
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1]));
        if (payload.exp > Date.now() / 1e3 + 3600) {
          return currentToken;
        }
      }
    } catch {
    }
  }
  const body = JSON.stringify({
    appName: config.api_endpoint_static_value?.appName || "",
    deviceId: sessionData?.deviceId || "",
    refreshToken: sessionData?.refreshToken || ""
  });
  const headers = [
    "User-Agent: " + (config.api_endpoint_static_value?.["User-Agent-OkHttp"] || ""),
    "accesstoken: " + (currentToken || ""),
    "devicetype: " + (config.api_endpoint_static_value?.deviceType || ""),
    "versionCode: " + (config.api_endpoint_static_value?.versionCode || ""),
    "os: " + (config.api_endpoint_static_value?.os || ""),
    "uniqueid: " + (sessionData?.sessionAttributes?.user?.unique || ""),
    "content-type: application/json; charset=utf-8"
  ];
  const url = decodeApiUrl(config.jiotv_api?.refreshtoken);
  const result = await jioFetch(url, headers, "POST", body);
  let json2 = {};
  try {
    json2 = JSON.parse(result.data);
  } catch {
  }
  if (json2.code === 200 && json2.data?.authToken) {
    sessionData.authToken = json2.data.authToken;
    sessionData.refreshToken = json2.data.refreshToken ?? sessionData.refreshToken;
    return json2.data.authToken;
  }
  return currentToken || "";
}
__name(getValidToken, "getValidToken");
async function getChannels(config, env) {
  const cached = await env.KV.get("jiotv_channels", "json");
  if (cached)
    return cached;
  const url = config.api_endpoint?.live_channels;
  if (!url)
    return { result: [] };
  const resp = await fetch(url);
  if (!resp.ok)
    return { result: [] };
  const data = await resp.json();
  await env.KV.put("jiotv_channels", JSON.stringify(data), { expirationTtl: 86400 });
  return data;
}
__name(getChannels, "getChannels");

// src/live.js
function hexToStr(hex) {
  let s = "";
  for (let i = 0; i < hex.length; i += 2)
    s += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
  return s;
}
__name(hexToStr, "hexToStr");
var JIOTV_TOKEN = atob(hexToStr("536b6c5552553545556b46665331564e5156493d"));
function streamHeaders(sessionData, config, channelId, authToken, includeCookie = null) {
  const sv = config.api_endpoint_static_value ?? {};
  const user = sessionData?.sessionAttributes?.user ?? {};
  const headers = [
    "User-Agent: " + (sv["user-agent"] || sv["User-Agent-OkHttp"] || ""),
    "appkey: " + (sv.appkey || ""),
    "devicetype: " + (sv.deviceType || ""),
    "os: " + (sv.os || ""),
    "deviceid: " + (sessionData?.deviceId || ""),
    "versionCode: " + (sv.versionCode || ""),
    "osversion: " + (sv.osversion || ""),
    "dm: " + (sv.dm || ""),
    "x-platform: " + (sv["x-platform"] || ""),
    "uniqueid: " + (user.unique || ""),
    "usergroup: " + (sv.usergroup || ""),
    "languageid: 6",
    "userid: ril" + (user.subscriberId || ""),
    "sid: " + (sessionData?.analyticsId || ""),
    "crmid: " + (user.subscriberId || ""),
    "isott: " + (sv.isott || ""),
    "channelid: " + channelId,
    "langid: ",
    "camid: ",
    "appName: " + (sv.appName || ""),
    "srno: " + (/* @__PURE__ */ new Date()).toISOString().replace(/\D/g, "").slice(2, 16),
    "accesstoken: " + authToken,
    "ssotoken: " + (sessionData?.ssoToken || ""),
    "subscriberid: " + (user.subscriberId || ""),
    "lbcookie: 1",
    "priority: u=1"
  ];
  if (includeCookie)
    headers.push("cookie: " + includeCookie);
  return headers.filter((h) => h.trim() && !h.endsWith(": "));
}
__name(streamHeaders, "streamHeaders");
async function handleLive(channelId, sessionData, config, baseUrl, env) {
  if (!channelId || !sessionData) {
    return errorM3U8("Missing channel ID or not logged in");
  }
  let streamUrl = null;
  const cacheKey = `stream_${channelId}`;
  if (config.JITENDRA_UNIVERSE?.live_cache) {
    try {
      const cached = await env.KV.get(cacheKey, "json");
      if (cached?.result) {
        const expMatch = cached.result.match(/~exp=(\d+)/);
        if (expMatch && parseInt(expMatch[1]) > Date.now() / 1e3 + 30) {
          streamUrl = cached.result;
        }
      }
    } catch {
    }
  }
  if (!streamUrl) {
    const authToken = await getValidToken(sessionData, config);
    const user = sessionData?.sessionAttributes?.user ?? {};
    const sv = config.api_endpoint_static_value ?? {};
    const body = `stream_type=Seek&channel_id=${channelId}`;
    const headers = [
      "User-Agent: " + (sv["User-Agent-OkHttp"] || ""),
      "Content-Type: application/x-www-form-urlencoded",
      "appkey: " + (sv.appkey || ""),
      "devicetype: " + (sv.deviceType || ""),
      "os: " + (sv.os || ""),
      "deviceid: " + (sessionData?.deviceId || ""),
      "versionCode: " + (sv.versionCode || ""),
      "osversion: " + (sv.osversion || ""),
      "dm: " + (sv.dm || ""),
      "x-platform: " + (sv["x-platform"] || ""),
      "uniqueid: " + (user.unique || ""),
      "usergroup: " + (sv.usergroup || ""),
      "languageid: 6",
      "userid: ril" + (user.subscriberId || ""),
      "sid: " + (sessionData?.analyticsId || ""),
      "crmid: " + (user.subscriberId || ""),
      "isott: " + (sv.isott || ""),
      "channel_id: " + channelId,
      "langid: ",
      "camid: ",
      "accesstoken: " + authToken,
      "ssotoken: " + (sessionData?.ssoToken || ""),
      "subscriberid: " + (user.subscriberId || ""),
      "lbcookie: 1"
    ].filter((h) => h.trim() && !h.endsWith(": "));
    const getUrl = decodeApiUrl(config.jiotv_api?.geturl);
    const result = await jioFetch(getUrl, headers, "POST", body);
    let json2 = {};
    try {
      json2 = JSON.parse(result.data);
    } catch {
    }
    if (json2.code !== 200 || !json2.result) {
      return errorM3U8(`JioTV API error: ${json2.message || result.info.http_code}`);
    }
    streamUrl = json2.result;
    if (config.JITENDRA_UNIVERSE?.live_cache) {
      try {
        await env.KV.put(cacheKey, JSON.stringify(json2), { expirationTtl: 300 });
      } catch {
      }
    }
  }
  return await fetchAndRewriteM3U8(streamUrl, channelId, sessionData, config, baseUrl, env);
}
__name(handleLive, "handleLive");
async function fetchAndRewriteM3U8(streamUrl, channelId, sessionData, config, baseUrl, env) {
  const authToken = await getValidToken(sessionData, config);
  const headers = streamHeaders(sessionData, config, channelId, authToken);
  const result = await jioFetch(streamUrl, headers, "GET", null);
  const setCookie = result.responseHeaders["set-cookie"] || "";
  const cookieValue = setCookie.split(";")[0] || "";
  const urlObj = new URL(streamUrl);
  const basePath = urlObj.href.replace(/[^/]+$/, "");
  const lines = result.data.split("\n");
  const out = [];
  const thorB64 = btoa(cookieValue);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      out.push("");
      continue;
    }
    if (line.includes('URI="') && !line.startsWith("#EXT-X-KEY")) {
      const encBase = await encrypt(basePath);
      const newLine = line.replace('URI="', `URI="${baseUrl}/wanda.php?token=${JIOTV_TOKEN}&id=${channelId}&jane_foster=${encBase}&thor=${thorB64}&pkey=`);
      out.push(newLine);
    } else if (line.includes('URI="') && line.startsWith("#EXT-X-KEY")) {
      const encBase = await encrypt(basePath);
      const newLine = line.replace('URI="', `URI="${baseUrl}/wanda.php?token=${JIOTV_TOKEN}&id=${channelId}&jane_foster=${encBase}&thor=${thorB64}&pkey=`);
      out.push(newLine);
    } else if (line.endsWith(".m3u8") && !line.startsWith("#")) {
      const encBase = await encrypt(basePath);
      const encFull = await encrypt(basePath + line);
      out.push(`${baseUrl}/wanda.php?token=${JIOTV_TOKEN}&thor=${thorB64}&id=${channelId}&jane_foster=${encBase}&hls=${encFull}`);
    } else if (line.endsWith(".ts") && !line.startsWith("#")) {
      const encBase = await encrypt(basePath);
      const encFull = await encrypt(basePath + line);
      const wandaLine = `${baseUrl}/wanda.php?token=${JIOTV_TOKEN}&thor=${thorB64}&id=${channelId}&jane_foster=${encBase}&marvel=${encFull}`;
      out.push(wandaLine.replace(".ts", ".jitendraunatti"));
    } else {
      out.push(raw);
    }
  }
  const devBy = config.JITENDRA_UNIVERSE?.["x-developed-by"] || "JioTV";
  const tok = config.JITENDRA_UNIVERSE?.token || "";
  let m3u8 = out.join("\n");
  m3u8 = m3u8.replace("#EXTM3U", `#EXTM3U
#DEVELOPED_BY_${devBy}
#AUTHOR-${tok}`);
  return new Response(m3u8.trim(), {
    headers: {
      "Content-Type": "application/vnd.apple.mpegurl",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-cache, no-store"
    }
  });
}
__name(fetchAndRewriteM3U8, "fetchAndRewriteM3U8");
function errorM3U8(msg) {
  return new Response(`#EXTM3U
# Error: ${msg}`, {
    status: 200,
    headers: { "Content-Type": "application/vnd.apple.mpegurl" }
  });
}
__name(errorM3U8, "errorM3U8");

// src/wanda.js
function hexToStr2(hex) {
  let s = "";
  for (let i = 0; i < hex.length; i += 2)
    s += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
  return s;
}
__name(hexToStr2, "hexToStr");
var JIOTV_TOKEN2 = atob(hexToStr2("536b6c5552553545556b46665331564e5156493d"));
function buildSegHeaders(sessionData, config, channelId, authToken, cookie = "") {
  const sv = config.api_endpoint_static_value ?? {};
  const user = sessionData?.sessionAttributes?.user ?? {};
  const headers = [
    "User-Agent: " + (sv["user-agent"] || sv["User-Agent-OkHttp"] || ""),
    "appkey: " + (sv.appkey || ""),
    "devicetype: " + (sv.deviceType || ""),
    "os: " + (sv.os || ""),
    "deviceid: " + (sessionData?.deviceId || ""),
    "versionCode: " + (sv.versionCode || ""),
    "osversion: " + (sv.osversion || ""),
    "dm: " + (sv.dm || ""),
    "x-platform: " + (sv["x-platform"] || ""),
    "uniqueid: " + (user.unique || ""),
    "usergroup: " + (sv.usergroup || ""),
    "languageid: 6",
    "userid: ril" + (user.subscriberId || ""),
    "sid: " + (sessionData?.analyticsId || ""),
    "crmid: " + (user.subscriberId || ""),
    "isott: " + (sv.isott || ""),
    "channelid: " + channelId,
    "langid: ",
    "camid: ",
    "appName: " + (sv.appName || ""),
    "srno: " + (/* @__PURE__ */ new Date()).toISOString().replace(/\D/g, "").slice(2, 16),
    "accesstoken: " + authToken,
    "ssotoken: " + (sessionData?.ssoToken || ""),
    "subscriberid: " + (user.subscriberId || ""),
    "lbcookie: 1",
    "priority: u=1",
    ...cookie ? ["cookie: " + cookie] : []
  ].filter((h) => h.trim() && !h.endsWith(": "));
  return headers;
}
__name(buildSegHeaders, "buildSegHeaders");
async function handleWanda(request, sessionData, config, baseUrl) {
  const params = new URL(request.url).searchParams;
  const channelId = params.get("id") || "";
  const thorB64 = params.get("thor") || "";
  const janeFoster = params.get("jane_foster") || "";
  const hls = params.get("hls") || "";
  const marvel = params.get("marvel") || "";
  const pkey = params.get("pkey") || "";
  const cookie = thorB64 ? (() => {
    try {
      return atob(thorB64);
    } catch {
      return "";
    }
  })() : "";
  const authToken = await getValidToken(sessionData, config);
  const headers = buildSegHeaders(sessionData, config, channelId, authToken, cookie);
  if (hls) {
    let realUrl = await decrypt(hls);
    if (!realUrl)
      return new Response("# Decryption failed", { status: 400 });
    realUrl = realUrl.replace(".jitendraunatti", ".m3u8");
    const result = await jioFetch(realUrl, headers, "GET", null);
    const decBase = await decrypt(janeFoster) || janeFoster;
    const lines = result.data.split("\n");
    const out = [];
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) {
        out.push("");
        continue;
      }
      if (line.includes('URI="')) {
        const encBase = await encrypt(decBase);
        out.push(line.replace('URI="', `URI="${baseUrl}/wanda.php?token=${JIOTV_TOKEN2}&id=${channelId}&jane_foster=${encBase}&thor=${thorB64}&pkey=`));
      } else if (line.endsWith(".ts") && !line.startsWith("#")) {
        const encBase = await encrypt(decBase);
        const encFull = await encrypt(decBase + line);
        out.push(`${baseUrl}/wanda.php?token=${JIOTV_TOKEN2}&thor=${thorB64}&id=${channelId}&jane_foster=${encBase}&marvel=${encFull}`);
      } else {
        out.push(raw);
      }
    }
    const devBy = config.JITENDRA_UNIVERSE?.["x-developed-by"] || "JioTV";
    const tok = config.JITENDRA_UNIVERSE?.token || "";
    let m3u8 = out.join("\n");
    m3u8 = m3u8.replace("#EXTM3U", `#EXTM3U
#DEVELOPED_BY_${devBy}
#AUTHOR-${tok}`);
    m3u8 = m3u8.replace(/\.ts/g, ".jitendraunatti");
    return new Response(m3u8.trim(), {
      headers: {
        "Content-Type": "application/vnd.apple.mpegurl",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-cache"
      }
    });
  }
  if (marvel) {
    let realUrl = await decrypt(marvel);
    if (!realUrl)
      return new Response("# Decryption failed", { status: 400 });
    realUrl = realUrl.replace(".jitendraunatti", ".ts");
    const result = await jioFetch(realUrl, headers, "GET", null);
    return new Response(result.dataBuffer, {
      headers: {
        "Content-Type": "video/mp2t",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "max-age=60"
      }
    });
  }
  if (pkey) {
    const result = await jioFetch(pkey, headers, "GET", null);
    return new Response(result.dataBuffer, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }
  return new Response("#WANDA_ERROR: missing params", {
    headers: { "Content-Type": "text/plain" }
  });
}
__name(handleWanda, "handleWanda");

// src/playlist.js
function hexToStr3(hex) {
  let s = "";
  for (let i = 0; i < hex.length; i += 2)
    s += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
  return s;
}
__name(hexToStr3, "hexToStr");
var JIOTV_TOKEN3 = atob(hexToStr3("536b6c5552553545556b46665331564e5156493d"));
var ZEE_LANG_MAP = {
  hi: "Hindi",
  en: "English",
  mr: "Marathi",
  ta: "Tamil",
  te: "Telugu",
  kn: "Kannada",
  ml: "Malayalam",
  bn: "Bengali",
  gu: "Gujarati",
  pa: "Punjabi",
  or: "Odia",
  bh: "Bhojpuri",
  ur: "Urdu"
};
async function generatePlaylist(config, baseUrl, env) {
  const categories = config.channelCategoryMapping ?? {};
  const languages = config.languageIdMapping ?? {};
  let jioChannels = [];
  try {
    const cached = await env.KV.get("jiotv_channels", "json");
    if (cached?.result) {
      jioChannels = cached.result;
    } else {
      const url = config.api_endpoint?.live_channels;
      if (url) {
        const resp = await fetch(url);
        if (resp.ok) {
          const data = await resp.json();
          jioChannels = data.result ?? [];
          await env.KV.put("jiotv_channels", JSON.stringify(data), { expirationTtl: 86400 });
        }
      }
    }
  } catch {
  }
  let zeeChannels = [];
  try {
    const zeeUrl = config.zee_api?.web_api;
    if (zeeUrl) {
      const resp = await fetch(zeeUrl);
      if (resp.ok)
        zeeChannels = await resp.json();
    }
  } catch {
  }
  const lines = ['#EXTM3U x-tvg-url="https://tsepg.cf/epg.xml.gz"'];
  for (const ch of jioChannels) {
    const id = ch.channel_id ?? "";
    const name = ch.channel_name ?? "Unknown";
    const logo = `https://jiotvimages.cdn.jio.com/dare_images/images/${ch.logoUrl ?? ""}`;
    const group = (categories[ch.channelCategoryId] ?? "General") + " (JioTV)";
    const lang = languages[ch.channelLanguageId] ?? "Hindi";
    const url = `${baseUrl}/live.m3u8?id=${id}&token=${JIOTV_TOKEN3}`;
    lines.push(`#EXTINF:-1 tvg-id="${id}" tvg-logo="${logo}" group-title="${group}" tvg-language="${lang}", ${name}`);
    lines.push(url);
  }
  for (const zee of Array.isArray(zeeChannels) ? zeeChannels : []) {
    const name = zee.name ?? "Zee Channel";
    const logo = zee.logo ?? "";
    const group = (zee.genres ?? "Entertainment") + " (Zee5)";
    const lang = ZEE_LANG_MAP[zee.languages] ?? "Hindi";
    const url = `${baseUrl}/live.m3u8?id=${zee.link ?? ""}&token=${JIOTV_TOKEN3}`;
    lines.push(`#EXTINF:-1 tvg-id="${zee.id ?? ""}" tvg-logo="${logo}" group-title="${group}" tvg-language="${lang}", ${name}`);
    lines.push(url);
  }
  if (Array.isArray(config.addon_service)) {
    for (const addonUrl of config.addon_service) {
      try {
        const resp = await fetch(addonUrl);
        if (resp.ok)
          lines.push(await resp.text());
      } catch {
      }
    }
  }
  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Content-Disposition": 'attachment; filename="jiotv.m3u8"'
    }
  });
}
__name(generatePlaylist, "generatePlaylist");

// src/pages.js
function loginPage(config) {
  const meta = config?.meta_data ?? {};
  const appName = meta.hname || "JioTV+";
  const favicon = meta.himg || "https://jiotvimages.cdn.jio.com/dare_images/images/Jio_Cinema_logo.png";
  const bgPic = meta.bgpic || "https://images.unsplash.com/photo-1593078166039-c9878df5c520?w=1920&q=80";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Login \u2013 ${appName}</title>
  <link rel="icon" href="${favicon}"/>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet"/>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Plus Jakarta Sans',sans-serif;background:#020617;height:100vh;display:flex;align-items:center;justify-content:center;overflow:hidden;color:#f8fafc}
    .bg{position:fixed;inset:0;background:url('${bgPic}') center/cover no-repeat;filter:brightness(.3);z-index:-1}
    .card{background:rgba(15,23,42,.9);backdrop-filter:blur(24px);border:1px solid rgba(255,255,255,.1);box-shadow:0 50px 100px -20px rgba(0,0,0,.9);width:100%;max-width:440px;border-radius:2rem;padding:2.5rem;animation:fadeIn .6s ease}
    @keyframes fadeIn{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
    .logo{text-align:center;margin-bottom:1.5rem}
    .logo img{width:64px;height:64px;border-radius:16px;object-fit:cover}
    .logo h1{font-size:1.6rem;font-weight:800;margin-top:.6rem;background:linear-gradient(135deg,#6366f1,#a855f7);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
    .logo p{color:#64748b;font-size:.85rem;margin-top:.3rem}
    .field{margin-bottom:1rem}
    .field label{display:block;font-size:.8rem;font-weight:600;color:#94a3b8;margin-bottom:.4rem;text-transform:uppercase;letter-spacing:.05em}
    .field input{width:100%;background:rgba(2,6,23,.5);border:1.5px solid rgba(255,255,255,.1);border-radius:.75rem;padding:.9rem 1rem;color:#f1f5f9;font-size:1rem;font-family:inherit;transition:all .3s;outline:none}
    .field input:focus{border-color:#6366f1;background:rgba(2,6,23,.8);box-shadow:0 0 20px rgba(99,102,241,.2)}
    .field input::placeholder{color:#475569}
    #otp-input{font-size:1.5rem;letter-spacing:.5rem;font-weight:700;text-align:center}
    .btn{width:100%;border:none;border-radius:.75rem;padding:.95rem;font-size:1rem;font-weight:700;font-family:inherit;cursor:pointer;transition:all .25s;position:relative;overflow:hidden}
    .btn-primary{background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;box-shadow:0 8px 24px rgba(99,102,241,.35)}
    .btn-primary:hover,#send-btn:focus,#verify-btn:focus{transform:translateY(-2px);box-shadow:0 12px 32px rgba(99,102,241,.45)}
    .btn-secondary{background:rgba(255,255,255,.06);color:#94a3b8;margin-top:.5rem}
    .btn:disabled{opacity:.5;cursor:not-allowed;transform:none}
    .msg{padding:.75rem 1rem;border-radius:.6rem;font-size:.85rem;font-weight:600;text-align:center;margin-top:.75rem;display:none}
    .msg.success{background:rgba(34,197,94,.12);color:#4ade80;border:1px solid rgba(34,197,94,.25)}
    .msg.error{background:rgba(239,68,68,.12);color:#f87171;border:1px solid rgba(239,68,68,.25)}
    .otp-box{display:none}
    .timer{text-align:center;color:#64748b;font-size:.8rem;margin-top:.5rem}
    .spin{display:inline-block;width:16px;height:16px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:spin .7s linear infinite;vertical-align:middle;margin-right:6px}
    @keyframes spin{to{transform:rotate(360deg)}}
  </style>
</head>
<body>
  <div class="bg"></div>
  <div class="card">
    <div class="logo">
      <img src="${favicon}" alt="${appName}" onerror="this.style.display='none'"/>
      <h1>${appName}</h1>
      <p>Login with your Jio number</p>
    </div>

    <!-- Step 1: Phone number -->
    <div id="phone-box">
      <div class="field">
        <label>Jio Mobile Number</label>
        <input type="tel" id="phone" placeholder="Enter 10-digit number" maxlength="10" autocomplete="tel" inputmode="numeric"/>
      </div>
      <button class="btn btn-primary" id="send-btn" onclick="sendOTP()">Send OTP</button>
      <div class="msg" id="send-msg"></div>
    </div>

    <!-- Step 2: OTP verification -->
    <div class="otp-box" id="otp-box">
      <div class="field">
        <label>Enter OTP</label>
        <input type="number" id="otp-input" class="otp-input" placeholder="------" maxlength="6" autocomplete="one-time-code" inputmode="numeric"/>
      </div>
      <button class="btn btn-primary" id="verify-btn" onclick="verifyOTP()">Verify &amp; Watch</button>
      <button class="btn btn-secondary" id="back-btn" onclick="goBack()">&#8592; Change Number</button>
      <div class="timer" id="timer-txt"></div>
      <div class="msg" id="otp-msg"></div>
    </div>
  </div>

  <script>
    let timerInterval;

    function showMsg(id, text, type) {
      const el = document.getElementById(id);
      el.textContent = text;
      el.className = 'msg ' + type;
      el.style.display = 'block';
    }

    function setLoading(btnId, loading, text) {
      const btn = document.getElementById(btnId);
      btn.disabled = loading;
      btn.innerHTML = loading ? '<span class="spin"></span>' + text : text;
    }

    async function sendOTP() {
      const phone = document.getElementById('phone').value.trim();
      if (!/^[6-9]\\d{9}$/.test(phone)) {
        showMsg('send-msg', 'Enter a valid 10-digit Indian mobile number', 'error');
        return;
      }
      setLoading('send-btn', true, 'Sending OTP...');
      try {
        const res = await fetch('/api/otpsend', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ number: phone })
        });
        const data = await res.json();
        if (data.message === 'SUCCESS') {
          document.getElementById('phone-box').style.display = 'none';
          document.getElementById('otp-box').style.display = 'block';
          showMsg('otp-msg', data.ui_label, 'success');
          startTimer(120);
          setTimeout(() => document.getElementById('otp-input').focus(), 100);
        } else {
          showMsg('send-msg', data.ui_label, 'error');
        }
      } catch (e) {
        showMsg('send-msg', 'Network error. Please try again.', 'error');
      }
      setLoading('send-btn', false, 'Send OTP');
    }

    async function verifyOTP() {
      const otp = document.getElementById('otp-input').value.trim();
      if (!/^\\d{6}$/.test(otp)) {
        showMsg('otp-msg', 'Enter the 6-digit OTP', 'error');
        return;
      }
      setLoading('verify-btn', true, 'Verifying...');
      try {
        const res = await fetch('/api/otpverify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ otp })
        });
        const data = await res.json();
        if (data.message === 'SUCCESS') {
          showMsg('otp-msg', data.ui_label, 'success');
          clearInterval(timerInterval);
          setTimeout(() => window.location.href = '/', 800);
        } else {
          showMsg('otp-msg', data.ui_label, 'error');
          setLoading('verify-btn', false, 'Verify &amp; Watch');
        }
      } catch (e) {
        showMsg('otp-msg', 'Network error. Please try again.', 'error');
        setLoading('verify-btn', false, 'Verify &amp; Watch');
      }
    }

    function goBack() {
      document.getElementById('otp-box').style.display = 'none';
      document.getElementById('phone-box').style.display = 'block';
      clearInterval(timerInterval);
    }

    function startTimer(secs) {
      let s = secs;
      const el = document.getElementById('timer-txt');
      timerInterval = setInterval(() => {
        el.textContent = 'OTP expires in ' + s + 's';
        if (--s < 0) { clearInterval(timerInterval); el.textContent = 'OTP expired. Please request again.'; }
      }, 1000);
    }

    // Enter key support
    document.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        if (document.getElementById('otp-box').style.display === 'block') verifyOTP();
        else sendOTP();
      }
    });
  <\/script>
</body>
</html>`;
}
__name(loginPage, "loginPage");
function channelPage(config, channels) {
  const meta = config?.meta_data ?? {};
  const appName = meta.hname || "JioTV+";
  const favicon = meta.himg || "https://jiotvimages.cdn.jio.com/dare_images/images/Jio_Cinema_logo.png";
  const categories = config?.channelCategoryMapping ?? {};
  const catList = Object.entries(categories).map(([id, name]) => `<option value="${id}">${name}</option>`).join("");
  const languages = config?.languageIdMapping ?? {};
  const langList = Object.entries(languages).map(([id, name]) => `<option value="${id}">${name}</option>`).join("");
  const jioChannels = channels?.result ?? [];
  const channelCards = jioChannels.map((ch) => {
    const id = ch.channel_id ?? "";
    const name = ch.channel_name ?? "Unknown";
    const logo = `https://jiotvimages.cdn.jio.com/dare_images/images/${ch.logoUrl ?? ""}`;
    const catId = String(ch.channelCategoryId ?? "");
    const langId = String(ch.channelLanguageId ?? "");
    const cat = categories[catId] ?? "General";
    return `<button class="ch-card" tabindex="0" data-id="${id}" data-cat="${catId}" data-lang="${langId}" data-name="${name.toLowerCase()}" onclick="playChannel('${id}','${name.replace(/'/g, "\\'")}','${ch.logoUrl ?? ""}')">
      <img src="${logo}" alt="${name}" loading="lazy" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 1 1%22/>'"/>
      <span>${name}</span>
    </button>`;
  }).join("");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${appName} \u2013 Live TV</title>
  <link rel="icon" href="${favicon}"/>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet"/>
  <style>
    :root{--bg:#07090f;--surface:#0f1117;--card:#161922;--border:#1e2330;--accent:#6366f1;--accent2:#8b5cf6;--text:#e2e8f0;--muted:#64748b;--radius:12px}
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Inter',sans-serif;background:var(--bg);color:var(--text);min-height:100vh}
    header{background:var(--surface);border-bottom:1px solid var(--border);padding:12px 20px;display:flex;align-items:center;gap:16px;position:sticky;top:0;z-index:100;backdrop-filter:blur(12px)}
    .logo-txt{font-size:1.2rem;font-weight:800;background:linear-gradient(135deg,#6366f1,#a855f7);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;white-space:nowrap}
    .search{flex:1;background:rgba(255,255,255,.05);border:1px solid var(--border);border-radius:8px;padding:8px 14px;color:var(--text);font-size:.9rem;font-family:inherit;outline:none;transition:border-color .2s}
    .search:focus{border-color:var(--accent)}
    .search::placeholder{color:var(--muted)}
    select{background:rgba(255,255,255,.05);border:1px solid var(--border);border-radius:8px;padding:8px 10px;color:var(--text);font-size:.85rem;font-family:inherit;outline:none;cursor:pointer;max-width:130px}
    select option{background:#1a1d24}
    .logout-btn{background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.3);color:#f87171;padding:7px 14px;border-radius:8px;cursor:pointer;font-size:.8rem;font-weight:600;white-space:nowrap;transition:all .2s}
    .logout-btn:hover{background:rgba(239,68,68,.25)}
    .controls{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
    main{padding:16px 20px}
    .section-title{font-size:.7rem;text-transform:uppercase;letter-spacing:2px;color:var(--muted);margin-bottom:12px;font-weight:700}
    .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px}
    @media(min-width:768px){.grid{grid-template-columns:repeat(auto-fill,minmax(140px,1fr))}}
    @media(min-width:1280px){.grid{grid-template-columns:repeat(auto-fill,minmax(130px,1fr))}}
    .ch-card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:12px 8px;display:flex;flex-direction:column;align-items:center;gap:8px;cursor:pointer;transition:all .2s;text-align:center;width:100%;min-height:110px;justify-content:center}
    .ch-card:hover,.ch-card:focus{border-color:var(--accent);background:rgba(99,102,241,.08);transform:translateY(-2px);box-shadow:0 8px 24px rgba(99,102,241,.2);outline:2px solid var(--accent)}
    .ch-card img{width:56px;height:56px;object-fit:contain;border-radius:8px;background:#111}
    .ch-card span{font-size:.72rem;font-weight:600;color:var(--text);line-height:1.3;max-width:120px;word-break:break-word}
    .hidden{display:none!important}
    .empty-msg{grid-column:1/-1;text-align:center;color:var(--muted);padding:40px;font-size:.9rem}
    .count-badge{background:rgba(99,102,241,.15);border:1px solid rgba(99,102,241,.3);color:#a5b4fc;font-size:.75rem;font-weight:700;padding:3px 10px;border-radius:50px}
  </style>
</head>
<body>
  <header>
    <span class="logo-txt">${appName}</span>
    <input class="search" type="search" id="search" placeholder="Search channels..." oninput="filterChannels()" autocomplete="off"/>
    <div class="controls">
      <select id="cat-filter" onchange="filterChannels()"><option value="">All Genres</option>${catList}</select>
      <select id="lang-filter" onchange="filterChannels()"><option value="">All Languages</option>${langList}</select>
      <span class="count-badge" id="count-badge">${jioChannels.length} channels</span>
      <button class="logout-btn" onclick="logout()">Logout</button>
    </div>
  </header>
  <main>
    <p class="section-title">Live Channels</p>
    <div class="grid" id="channel-grid">
      ${channelCards}
      <div class="empty-msg hidden" id="empty-msg">No channels match your search</div>
    </div>
  </main>

  <script>
    function filterChannels() {
      const q    = document.getElementById('search').value.toLowerCase();
      const cat  = document.getElementById('cat-filter').value;
      const lang = document.getElementById('lang-filter').value;
      const cards = document.querySelectorAll('.ch-card');
      let visible = 0;
      cards.forEach(card => {
        const matchName = !q    || card.dataset.name.includes(q);
        const matchCat  = !cat  || card.dataset.cat  === cat;
        const matchLang = !lang || card.dataset.lang  === lang;
        const show = matchName && matchCat && matchLang;
        card.classList.toggle('hidden', !show);
        if (show) visible++;
      });
      document.getElementById('empty-msg').classList.toggle('hidden', visible > 0);
      document.getElementById('count-badge').textContent = visible + ' channels';
    }

    function playChannel(id, name, logo) {
      window.location.href = '/play.php?id=' + id + '&cid=' + encodeURIComponent(logo) + '&name=' + encodeURIComponent(name);
    }

    async function logout() {
      await fetch('/logout', { method: 'POST' });
      window.location.href = '/login';
    }

    // Keyboard navigation for TV remote
    document.addEventListener('keydown', e => {
      if (e.key === 'Backspace' && document.activeElement.tagName !== 'INPUT') {
        history.back();
      }
    });
  <\/script>
</body>
</html>`;
}
__name(channelPage, "channelPage");
function playerPage(channelId, channelName, logoUrl, config) {
  const meta = config?.meta_data ?? {};
  const appName = meta.hname || "JioTV+";
  const favicon = meta.himg || logoUrl || "";
  function hexToStr5(hex) {
    let s = "";
    for (let i = 0; i < hex.length; i += 2)
      s += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
    return s;
  }
  __name(hexToStr5, "hexToStr");
  const JIOTV_TOKEN5 = atob(hexToStr5("536b6c5552553545556b46665331564e5156493d"));
  const streamUrl = `/live.m3u8?id=${channelId}&token=${JIOTV_TOKEN5}`;
  const logoFull = logoUrl ? `https://jiotvimages.cdn.jio.com/dare_images/images/${logoUrl}` : favicon;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${channelName} | ${appName}</title>
  <link rel="icon" href="${logoFull}"/>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/plyr@3.7.8/dist/plyr.css"/>
  <script src="https://cdn.jsdelivr.net/npm/hls.js@1.4.14/dist/hls.min.js"><\/script>
  <script src="https://cdn.jsdelivr.net/npm/plyr@3.7.8/dist/plyr.min.js"><\/script>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    html,body{width:100%;height:100%;background:#000;overflow:hidden;font-family:sans-serif}
    video,.plyr,.plyr__video-wrapper{width:100vw;height:100dvh}
    video,.plyr{position:fixed;top:0;left:0}
    .plyr{margin:0!important}
    .back-btn{position:fixed;top:16px;left:16px;z-index:999;background:rgba(0,0,0,.7);border:1px solid rgba(255,255,255,.2);color:#fff;padding:8px 16px;border-radius:8px;cursor:pointer;font-size:.85rem;font-weight:600;backdrop-filter:blur(8px);transition:all .2s;text-decoration:none;display:flex;align-items:center;gap:6px;opacity:0;transition:opacity .3s}
    body:hover .back-btn{opacity:1}
    .channel-info{position:fixed;top:16px;right:16px;z-index:999;display:flex;align-items:center;gap:10px;background:rgba(0,0,0,.7);border:1px solid rgba(255,255,255,.15);border-radius:10px;padding:8px 14px;backdrop-filter:blur(8px);opacity:0;transition:opacity .3s}
    body:hover .channel-info{opacity:1}
    .channel-info img{width:36px;height:36px;object-fit:contain;border-radius:6px}
    .channel-info span{color:#fff;font-size:.85rem;font-weight:600;max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .error-overlay{display:none;position:fixed;inset:0;background:#000;align-items:center;justify-content:center;flex-direction:column;gap:16px;z-index:999}
    .error-overlay.show{display:flex}
    .error-overlay h2{color:#fff;font-size:1.2rem}
    .error-overlay p{color:#888;font-size:.85rem}
    .retry-btn{background:#6366f1;color:#fff;border:none;padding:10px 24px;border-radius:8px;cursor:pointer;font-size:.9rem;font-weight:600}
  </style>
</head>
<body>
  <a href="/" class="back-btn">&#8592; All Channels</a>
  <div class="channel-info">
    <img src="${logoFull}" alt="${channelName}" onerror="this.style.display='none'"/>
    <span>${channelName}</span>
  </div>

  <video id="player" playsinline controls></video>

  <div class="error-overlay" id="error-overlay">
    <h2>&#9888; Stream Error</h2>
    <p id="error-msg">Could not load the channel. Try again.</p>
    <button class="retry-btn" onclick="location.reload()">Retry</button>
    <a href="/" style="color:#888;font-size:.8rem">&#8592; Back to channels</a>
  </div>

  <script>
    const SRC = '${streamUrl}';
    const video = document.getElementById('player');

    const player = new Plyr(video, {
      controls: ['play','progress','current-time','mute','volume','fullscreen'],
      fullscreen: { enabled: true, fallback: true, iosNative: true },
      resetOnEnd: false,
      keyboard: { focused: true, global: true },
    });

    if (Hls.isSupported()) {
      const hls = new Hls({
        maxLoadingDelay: 4,
        maxBufferLength: 30,
        startFragPrefetch: true,
        xhrSetup: (xhr) => { xhr.withCredentials = false; }
      });
      hls.loadSource(SRC);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {});
      });
      hls.on(Hls.Events.ERROR, (e, data) => {
        if (data.fatal) {
          document.getElementById('error-msg').textContent = data.details || 'Fatal stream error';
          document.getElementById('error-overlay').classList.add('show');
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native HLS (Safari)
      video.src = SRC;
      video.play().catch(() => {});
    } else {
      document.getElementById('error-overlay').classList.add('show');
    }

    // Back button / Backspace \u2192 go to channel list
    document.addEventListener('keydown', e => {
      if (e.key === 'Backspace' || e.key === 'BrowserBack') {
        window.location.href = '/';
      }
    });
  <\/script>
</body>
</html>`;
}
__name(playerPage, "playerPage");
function errorPage(title, message, link = "/", linkText = "Go Back") {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${title}</title>
  <style>
    body{font-family:sans-serif;background:#07090f;color:#e2e8f0;display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;gap:12px;text-align:center;padding:20px}
    h1{font-size:1.5rem;color:#f87171}
    p{color:#64748b;font-size:.9rem}
    a{background:#6366f1;color:#fff;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:8px;display:inline-block}
  </style>
</head>
<body>
  <h1>&#9888; ${title}</h1>
  <p>${message}</p>
  <a href="${link}">${linkText}</a>
</body>
</html>`;
}
__name(errorPage, "errorPage");

// src/index.js
function hexToStr4(h) {
  let s = "";
  for (let i = 0; i < h.length; i += 2)
    s += String.fromCharCode(parseInt(h.slice(i, i + 2), 16));
  return s;
}
__name(hexToStr4, "hexToStr");
var JIOTV_TOKEN4 = atob(hexToStr4("536b6c5552553545556b46665331564e5156493d"));
var CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};
function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS, ...extra }
  });
}
__name(json, "json");
function html(body, status = 200, extra = {}) {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", ...extra }
  });
}
__name(html, "html");
function redirect(url, status = 302) {
  return Response.redirect(url, status);
}
__name(redirect, "redirect");
var src_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const method = request.method;
    const baseUrl = url.origin;
    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }
    let config;
    try {
      config = await getConfig(env);
    } catch (e) {
      console.error("Config error:", e);
      return html(errorPage("Config Error", "Could not load JioTV configuration. Please try again later."));
    }
    if (pathname === "/login" && method === "GET") {
      return html(loginPage(config));
    }
    if (pathname === "/api/otpsend" && method === "POST") {
      let body = {};
      try {
        body = await request.json();
      } catch {
      }
      const { number } = body;
      if (!number || !/^[6-9]\d{9}$/.test(String(number).trim())) {
        return json({ message: "INVALID", ui_label: "Enter a valid 10-digit mobile number \u274C" }, 400);
      }
      const result = await sendOTP(String(number).trim(), config, env);
      return json(result);
    }
    if (pathname === "/api/otpverify" && method === "POST") {
      let body = {};
      try {
        body = await request.json();
      } catch {
      }
      const { otp } = body;
      if (!otp || !/^\d{4,6}$/.test(String(otp).trim())) {
        return json({ message: "INVALID", ui_label: "Enter the OTP \u274C" }, 400);
      }
      const result = await verifyOTP(String(otp).trim(), config, env);
      if (result.message === "SUCCESS") {
        const sessionId = await createSession(result.sessionData, env);
        return json(
          { message: "SUCCESS", ui_label: result.ui_label },
          200,
          { "Set-Cookie": buildSetCookie(sessionId) }
        );
      }
      return json(result);
    }
    if (pathname === "/logout" && method === "POST") {
      const session2 = await getSession(request, env);
      await deleteSession(request, env);
      return json({ ok: true }, 200, { "Set-Cookie": buildClearCookie() });
    }
    const session = await getSession(request, env);
    if (!session) {
      if (pathname.startsWith("/api/") || pathname.startsWith("/live") || pathname.startsWith("/wanda") || pathname.startsWith("/playlist")) {
        return json({ error: "Not authenticated", redirect: "/login" }, 401);
      }
      return redirect("/login");
    }
    if ((pathname === "/" || pathname === "/index.php") && method === "GET") {
      const channels = await getChannels(config, env);
      return html(channelPage(config, channels));
    }
    if (pathname === "/login" && method === "GET") {
      return redirect("/");
    }
    if ((pathname === "/play.php" || pathname === "/play") && method === "GET") {
      const channelId = url.searchParams.get("id") || "";
      const channelName = url.searchParams.get("name") || url.searchParams.get("cid") || "Channel";
      const logoUrl = url.searchParams.get("cid") || "";
      const decodedName = decodeURIComponent(channelName);
      return html(playerPage(channelId, decodedName, logoUrl, config));
    }
    if ((pathname === "/live.php" || pathname === "/live.m3u8") && method === "GET") {
      const channelId = url.searchParams.get("id") || "";
      const token = url.searchParams.get("token") || "";
      if (token !== JIOTV_TOKEN4 && !session) {
        return new Response("#EXTM3U\n# Unauthorized", {
          status: 401,
          headers: { "Content-Type": "application/vnd.apple.mpegurl" }
        });
      }
      return await handleLive(channelId, session, config, baseUrl, env);
    }
    if (pathname === "/wanda.php" && method === "GET") {
      return await handleWanda(request, session, config, baseUrl);
    }
    if (pathname === "/playlist.php" && method === "GET") {
      return await generatePlaylist(config, baseUrl, env);
    }
    if (pathname === "/api" || pathname === "/jitendraunatti.php") {
      if (method === "POST") {
        let body = {};
        try {
          body = await request.json();
        } catch {
        }
        const action = body.action || "";
        if (action === "livechannels") {
          const data = await getChannels(config, env);
          return json(data);
        }
        if (action === "otpsend") {
          const { number } = body;
          const result = await sendOTP(String(number || "").trim(), config, env);
          return json(result);
        }
        if (action === "otpverify") {
          const { otp } = body;
          const result = await verifyOTP(String(otp || "").trim(), config, env);
          if (result.message === "SUCCESS") {
            const sessionId = await createSession(result.sessionData, env);
            return json(
              { message: "SUCCESS", ui_label: result.ui_label },
              200,
              { "Set-Cookie": buildSetCookie(sessionId) }
            );
          }
          return json(result);
        }
        return json({ error: "Unknown action" }, 400);
      }
      if (method === "GET") {
        return redirect("/");
      }
    }
    return html(errorPage("404 Not Found", `No route for ${pathname}`, "/", "Home"), 404);
  }
};
export {
  src_default as default
};
//# sourceMappingURL=index.js.map
