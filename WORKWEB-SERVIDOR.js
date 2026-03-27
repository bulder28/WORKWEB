const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');

const PORT = 8000;
const DIR = __dirname;

// ==================== HELPERS ====================
function setCorsHeaders(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key, anthropic-version, anthropic-dangerously-allow-browser');
}

function sendJson(res, statusCode, payload) {
    setCorsHeaders(res);
    res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(payload));
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        let data = '';
        req.on('data', chunk => { data += chunk.toString(); });
        req.on('end', () => resolve(data));
        req.on('error', reject);
    });
}

// ==================== SERVER ====================
const server = http.createServer(async (req, res) => {

    // OPTIONS preflight
    if (req.method === 'OPTIONS') {
        setCorsHeaders(res);
        res.writeHead(204);
        res.end();
        return;
    }

    // ==================== PROXY ANTHROPIC ====================
    if (req.url === '/api/anthropic' && req.method === 'POST') {
        try {
            const body = await readBody(req);
            const apiKey = req.headers['x-api-key'] || '';
            const anthropicVersion = req.headers['anthropic-version'] || '2023-06-01';

            const apiReq = https.request('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': anthropicVersion,
                    'anthropic-dangerously-allow-browser': 'true'
                }
            }, apiRes => {
                let apiBody = '';
                apiRes.on('data', chunk => apiBody += chunk);
                apiRes.on('end', () => {
                    setCorsHeaders(res);
                    res.writeHead(apiRes.statusCode, { 'Content-Type': 'application/json' });
                    res.end(apiBody);
                });
            });

            apiReq.on('error', e => {
                sendJson(res, 500, { error: { message: 'Proxy error: ' + e.message } });
            });

            apiReq.write(body);
            apiReq.end();
        } catch (e) {
            sendJson(res, 500, { error: { message: e.message } });
        }
        return;
    }

    // ==================== SERVIR ARCHIVOS ====================
    let urlPath = req.url.split('?')[0];
    if (urlPath === '/' || urlPath === '') urlPath = '/workweb_agents.html';

    const filePath = path.join(DIR, urlPath);

    // Security: only serve files inside the working directory
    if (!filePath.startsWith(DIR)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = {
        '.html': 'text/html; charset=utf-8',
        '.js':   'text/javascript; charset=utf-8',
        '.css':  'text/css; charset=utf-8',
        '.json': 'application/json',
        '.png':  'image/png',
        '.jpg':  'image/jpeg',
        '.svg':  'image/svg+xml',
        '.ico':  'image/x-icon'
    }[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found: ' + urlPath);
        } else {
            setCorsHeaders(res);
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content);
        }
    });
});

server.listen(PORT, () => {
    console.log('\n==========================================');
    console.log('  🚀  WORKWEB AGENT HUB - SERVIDOR LOCAL');
    console.log('==========================================');
    console.log(`  🌐  URL: http://localhost:${PORT}/`);
    console.log('  🔑  Motor: Claude (Anthropic) via Proxy');
    console.log('  🛡️  CORS Proxy activo en /api/anthropic');
    console.log('==========================================\n');
});
