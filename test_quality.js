const https = require('https');

function fetchPage(url) {
  return new Promise((resolve) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8'
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return fetchPage(res.headers.location).then(resolve);
      }
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve(body));
    }).on('error', () => resolve(''));
  });
}

async function test() {
  console.log('=== Testing megacine API quality ===');
  
  // Test multiple movies
  const ids = [13919, 13800, 13700, 13600, 13500];
  for (const id of ids) {
    try {
      const r = await fetch('https://megacine.media/json?id=' + id + '&version=0&season=1&series=1&a=false&android=0');
      const d = await r.json();
      const quality = d.video_url ? d.video_url.match(/\.(\d+p)/) : null;
      console.log('ID ' + id + ': ' + (quality ? quality[1] : 'unknown') + ' - ' + (d.video_url || 'no url').slice(0, 120));
    } catch (e) {
      console.log('ID ' + id + ': ERROR - ' + e.message);
    }
  }

  console.log('\n=== Testing seriesflixgo ===');
  try {
    const html = await fetchPage('https://www.seriesflixgo.com/filme/spider-man-brand-new-day');
    const qualityUrls = html.match(/https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/g) || [];
    console.log('HLS URLs found:', qualityUrls.length);
    qualityUrls.slice(0, 3).forEach(u => console.log('  ', u.slice(0, 150)));
    
    // Check for quality indicators
    const qualityMatches = html.match(/\d+p/g) || [];
    const uniqueQualities = [...new Set(qualityMatches)];
    console.log('Quality indicators:', uniqueQualities.join(', '));
  } catch (e) {
    console.log('Seriesflixgo error:', e.message);
  }

  console.log('\n=== Testing plenoflu API ===');
  try {
    const plenoR = await fetch('https://plenoflu.com/api', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': 'https://plenoflu.com/',
        'Origin': 'https://plenoflu.com'
      },
      body: 'action=search&query=spider-man'
    });
    const plenoData = await plenoR.json();
    console.log('Plenoflu results:', JSON.stringify(plenoData).slice(0, 300));
  } catch (e) {
    console.log('Plenoflu error:', e.message);
  }
}

test();
