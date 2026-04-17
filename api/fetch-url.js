export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  try {
    // Parse URL properly - req.url might be relative or absolute
    const host = req.headers.host || req.headers['host'] || 'localhost';
    const urlObj = new URL(req.url, `https://${host}`);
    const url = urlObj.searchParams.get('url');

    if (!url) {
      return new Response(JSON.stringify({ error: 'URL parameter is required' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // Validate URL
    try {
      new URL(url);
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Invalid URL format' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // Check if we should use Puppeteer (for JS-heavy sites)
    const useJs = urlObj.searchParams.get('js') === 'true';
    let text;

    if (useJs) {
      // Use Jina Reader API for JS rendering (free tier)
      try {
        console.log('Using Jina Reader for JS rendering:', url);
        const jinaUrl = `https://r.jina.ai/${url}`;
        const response = await fetch(jinaUrl, {
          headers: {
            'Accept': 'text/plain',
            'X-Return-Format': 'text'
          }
        });
        
        if (!response.ok) {
          throw new Error(`Jina Reader failed: ${response.status}`);
        }
        
        text = await response.text();
        console.log('Content retrieved via Jina, length:', text.length);
      } catch (error) {
        console.error('Jina Reader error:', error);
        throw new Error(`JS rendering failed: ${error.message}`);
      }
    } else {
      // Simple fetch for static sites
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; AICompanionBot/1.0)',
        },
      });

      if (!response.ok) {
        return new Response(
          JSON.stringify({ 
            error: `Failed to fetch URL: ${response.status} ${response.statusText}` 
          }),
          {
            status: response.status,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          }
        );
      }

      text = await response.text();
    }

    return new Response(JSON.stringify({ content: text }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    console.error('Fetch URL error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error', 
        message: error.message 
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }
}
