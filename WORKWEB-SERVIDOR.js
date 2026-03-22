const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');

const PORT = 8000;
const DIR = __dirname;

const server = http.createServer((req, res) => {
    // 1. CORS Proxy Logic
    if (req.url === '/api/anthropic' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', () => {
            const apiReq = https.request('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': req.headers['x-api-key'],
                    'anthropic-version': req.headers['anthropic-version'],
                    'anthropic-dangerously-allow-browser': 'true'
                }
            }, apiRes => {
                let apiBody = '';
                apiRes.on('data', chunk => apiBody += chunk);
                apiRes.on('end', () => {
                    res.writeHead(apiRes.statusCode, {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    });
                    res.end(apiBody);
                });
            });
            apiReq.on('error', e => {
                res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                res.end(JSON.stringify({ error: { message: e.message } }));
            });
            apiReq.write(body);
            apiReq.end();
        });
        return;
    }
    
    // 2. CABECERAS CORS
    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, x-api-key, anthropic-version, anthropic-dangerously-allow-browser'
        });
        res.end();
        return;
    }

    // 3. SERVIR LA WEB HTML
    let filePathStr = req.url === '/' ? 'workweb_agents.html' : req.url;
    let filePath = path.join(DIR, filePathStr);
    const extname = path.extname(filePath);
    let contentType = 'text/html';
    switch (extname) {
        case '.js': contentType = 'text/javascript'; break;
        case '.css': contentType = 'text/css'; break;
    }

    fs.readFile(filePath, (err, content) => {
        if (err) {
            res.writeHead(404);
            res.end(No encontrado:  + req.url);
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

server.listen(PORT, () => {
    console.log(\n========================================);
    console.log(🚀 SERVIDOR WORKWEB INICIADO (ROOT));
    console.log(🌐 ABRE EN TU NAVEGADOR: http://localhost:/);
    console.log(🛡️ PROXY ANTICORS ACTIVADO);
    console.log(========================================\n);
});
