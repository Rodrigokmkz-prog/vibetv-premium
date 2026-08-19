exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Range'
      },
      body: ''
    };
  }

  const url = event.queryStringParameters?.url;
  if (!url) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing url' }) };
  }

  try {
    const parsedUrl = new URL(url);
    const host = parsedUrl.hostname;

    const megacineHosts = ['megacine.media', 'www.megacine.media'];
    const cdnHosts = ['cdn10embed.xyz', 'cdn20embed.xyz', 'cdn30embed.xyz'];

    const isMegacine = megacineHosts.includes(host);
    const isCdn = cdnHosts.some(function(h) { return host.includes(h); });

    if (!isMegacine && !isCdn) {
      return { statusCode: 403, body: JSON.stringify({ error: 'Host not allowed: ' + host }) };
    }

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      'Accept': '*/*'
    };

    if (isMegacine) {
      headers['Referer'] = 'https://megacine.media/';
      headers['Accept-Language'] = 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7';
    }

    if (isCdn) {
      headers['Referer'] = 'https://1.embedcanaisdetv.com/';
      headers['Origin'] = 'https://1.embedcanaisdetv.com/';
    }

    if (event.headers && event.headers.range) {
      headers['Range'] = event.headers.range;
    }

    const response = await fetch(url, { headers: headers });

    const respHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Content-Type'
    };

    const ct = response.headers.get('content-type');
    if (ct) respHeaders['Content-Type'] = ct;

    const cl = response.headers.get('content-length');
    if (cl) respHeaders['Content-Length'] = cl;

    const cr = response.headers.get('content-range');
    if (cr) respHeaders['Content-Range'] = cr;

    if (event.headers && event.headers.range) {
      respHeaders['Accept-Ranges'] = 'bytes';
    }

    if (isMegacine) {
      const body = await response.text();
      return {
        statusCode: response.status,
        headers: respHeaders,
        body: body
      };
    }

    const buffer = await response.arrayBuffer();
    return {
      statusCode: response.status,
      headers: respHeaders,
      body: Buffer.from(buffer).toString('base64'),
      isBase64Encoded: true
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
