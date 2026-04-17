import { chromium } from 'playwright-core';
import chromiumMin from '@sparticuz/chromium-min';

export const config = {
  runtime: 'nodejs',
  maxDuration: 60,
  memory: 3008,
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
      // Use Playwright to render JavaScript
      let browser = null;
      try {
        console.log('Launching Playwright for URL:', url);
        
        // Get Chromium executable path
        const executablePath = await chromiumMin.executablePath();
        console.log('Chromium path:', executablePath);
        
        // Launch browser using playwright-core with chromium-min
        browser = await chromium.launch({
          executablePath,
          headless: true,
          args: chromiumMin.args,
        });
        console.log('Browser launched successfully');

        const context = await browser.newContext({
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
          extraHTTPHeaders: {
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          },
        });

        const page = await context.newPage();
        
        console.log('Navigating to URL...');
        // Navigate and wait for network to be idle
        await page.goto(url, { 
          waitUntil: 'domcontentloaded',
          timeout: 45000 
        });
        
        console.log('Page loaded, waiting for dynamic content...');
        // Wait a bit more for dynamic content
        await page.waitForTimeout(2000);
        
        console.log('Getting page content...');
        // Get the rendered HTML
        text = await page.content();
        console.log('Content retrieved, length:', text.length);
        
        await browser.close();
      } catch (error) {
        if (browser) {
          try {
            await browser.close();
          } catch (e) {
            console.error('Error closing browser:', e);
          }
        }
        console.error('Playwright error details:', error);
        throw new Error(`Playwright error: ${error.message}`);
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
