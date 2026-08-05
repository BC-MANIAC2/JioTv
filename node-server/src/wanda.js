export async function handleWanda(request, sessionData, config, baseUrl, req, env) {
  const url = new URL(request.url);
  const params = url.searchParams;
  
  let sessionId = '';
  try {
    sessionId = await env.KV.get('teachub_session');
  } catch(e) {
    console.error("Failed to get teachub_session from KV", e);
  }

  // Construct target Teachub URL
  const targetUrl = `https://04jio.teachub.workers.dev/wanda.php?${params.toString()}`;
  
  const headers = {
    'Origin': 'https://2p.teachub.workers.dev',
    'User-Agent': 'Mozilla/5.0'
  };
  
  if (sessionId) {
    headers['Cookie'] = `session=${sessionId}`;
  }

  try {
    const response = await fetch(targetUrl, {
      method: request.method || 'GET',
      headers: headers
    });

    const responseHeaders = new Headers(response.headers);
    // Overwrite CORS headers so the browser can load it from our Render deployment
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.delete('Access-Control-Allow-Credentials');
    
    // Convert fetch body buffer directly
    const buffer = await response.arrayBuffer();

    return new Response(buffer, {
      status: response.status,
      headers: responseHeaders
    });
  } catch (err) {
    console.error("Proxy error:", err);
    return new Response('# Proxy Error', { status: 500 });
  }
}
