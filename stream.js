exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Range'
      },
      body: ''
    };
  }

  const url = event.queryStringParameters?.url;
  if (!url) {
    return { statusCode: 400, body: 'Missing url' };
  }

  try {
    const parsedUrl = new URL(url);
    const host = parsedUrl.hostname;

    const referrerMap = {
      'cdn10embed.xyz': 'https://1.embedcanaisdetv.com/',
      'cdn20embed.xyz': 'https://1.embedcanaisdetv.com/',
      'cdn30embed.xyz': 'https://1.embedcanaisdetv.com/'
    };

    let referrer = '';
    for (const key in referrerMap) {
      if (host.includes(key)) {
        referrer = referrerMap[key];
        break;
      }
    }
    if (!referrer) referrer = 'https://1.embedcanaisdetv.com/';

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': referrer,
      'Origin': referrer
    };

    if (event.headers?.range) {
      headers['Range'] = event.headers.range;
    }

    const response = await fetch(url, { headers });

    const respHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Content-Type'
    };

    const contentType = response.headers.get('content-type');
    if (contentType) respHeaders['Content-Type'] = contentType;

    const contentLength = response.headers.get('content-length');
    if (contentLength) respHeaders['Content-Length'] = contentLength;

    const contentRange = response.headers.get('content-range');
    if (contentRange) respHeaders['Content-Range'] = contentRange;

    if (event.headers?.range) {
      respHeaders['Accept-Ranges'] = 'bytes';
    }

    const buffer = await response.arrayBuffer();

    return {
      statusCode: response.status,
      headers: respHeaders,
      body: Buffer.from(buffer).toString('base64'),
      isBase64Encoded: true
    };
  } catch (err) {
    return { statusCode: 500, body: err.message };
  }
};
