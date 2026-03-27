const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');

const PORT = 8002;
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

    // ==================== AUDIT: fetch website snapshot ====================
    if (req.url === '/api/audit/fetch' && req.method === 'POST') {
        try {
            const rawBody = await readBody(req);
            const { url } = JSON.parse(rawBody || '{}');
            if (!url) { sendJson(res, 400, { error: 'URL requerida' }); return; }

            let targetUrl = url.trim();
            if (!/^https?:\/\//i.test(targetUrl)) targetUrl = 'https://' + targetUrl;

            let urlObj;
            try { urlObj = new URL(targetUrl); } catch { sendJson(res, 400, { error: 'URL no valida' }); return; }

            const client = urlObj.protocol === 'https:' ? https : http;
            const webReq = client.request(urlObj.toString(), {
                method: 'GET',
                headers: { 'User-Agent': 'WorkWebAuditor/1.0', 'Accept': 'text/html' }
            }, webRes => {
                let html = '';
                webRes.on('data', c => html += c.toString());
                webRes.on('end', () => {
                    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
                    const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i);
                    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 3000);
                    sendJson(res, 200, {
                        ok: true,
                        url: urlObj.toString(),
                        title: titleMatch?.[1]?.trim() || '',
                        description: descMatch?.[1]?.trim() || '',
                        text
                    });
                });
            });
            webReq.on('error', e => sendJson(res, 502, { error: 'No se pudo abrir la web: ' + e.message }));
            webReq.setTimeout(10000, () => { webReq.destroy(); sendJson(res, 504, { error: 'Timeout al cargar la web' }); });
            webReq.end();
        } catch (e) {
            sendJson(res, 500, { error: e.message });
        }
        return;
    }

    // ==================== BUSINESS INTEL (stub - returns structured data for Claude) ====================
    if (req.url === '/api/business-intel' && req.method === 'POST') {
        try {
            const rawBody = await readBody(req);
            const payload = JSON.parse(rawBody || '{}');
            // Return minimal structured data so the client-side Claude can use it
            sendJson(res, 200, {
                ok: true,
                nombre: payload.nombre || '',
                sector: payload.sector || '',
                zona: payload.zona || '',
                summary: `Negocio: ${payload.nombre || 'Desconocido'}. Sector: ${payload.sector || 'General'}. Zona: ${payload.zona || 'Illescas'}. ${payload.web ? 'Tiene web: ' + payload.web : 'Sin web conocida'}.`
            });
        } catch (e) {
            sendJson(res, 500, { error: e.message });
        }
        return;
    }

    // ==================== PROSPECTOR (OpenStreetMap) ====================
    if (req.url === '/api/prospector' && req.method === 'POST') {
        try {
            const rawBody = await readBody(req);
            const { zona, sector, radiusKm = 12 } = JSON.parse(rawBody || '{}');
            if (!zona || !sector) { sendJson(res, 400, { error: 'zona y sector son requeridos' }); return; }

            // Geocode with Nominatim
            const geoUrl = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=es&q=${encodeURIComponent(zona + ', Toledo, Spain')}`;
            const geoReq = https.request(geoUrl, { method: 'GET', headers: { 'User-Agent': 'WorkWebProspector/1.0' } }, geoRes => {
                let geoBody = '';
                geoRes.on('data', c => geoBody += c);
                geoRes.on('end', () => {
                    try {
                        const geoData = JSON.parse(geoBody);
                        if (!geoData?.length) { sendJson(res, 404, { error: 'No se pudo geolocalizar la zona' }); return; }
                        const { lat, lon } = geoData[0];
                        const radiusM = parseInt(radiusKm) * 1000;

                        const overpassQuery = `[out:json][timeout:25];(node["shop"](around:${radiusM},${lat},${lon});node["amenity"="restaurant"](around:${radiusM},${lat},${lon});node["amenity"="bar"](around:${radiusM},${lat},${lon});node["craft"](around:${radiusM},${lat},${lon}););out tags;`;
                        const overpassBody = `data=${encodeURIComponent(overpassQuery)}`;
                        const ovReq = https.request('https://overpass-api.de/api/interpreter', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'WorkWebProspector/1.0' }
                        }, ovRes => {
                            let ovBody = '';
                            ovRes.on('data', c => ovBody += c);
                            ovRes.on('end', () => {
                                try {
                                    const ovData = JSON.parse(ovBody);
                                    const leads = (ovData.elements || [])
                                        .filter(e => e.tags?.name)
                                        .map(e => ({
                                            nombre: e.tags.name,
                                            sector,
                                            zona,
                                            telefono: e.tags.phone || e.tags['contact:phone'] || '',
                                            email: e.tags.email || e.tags['contact:email'] || '',
                                            situacion_web: e.tags.website ? 'Con web' : e.tags.facebook ? 'Solo redes' : 'Sin web',
                                            potencial: !e.tags.website ? 'Alto' : 'Medio',
                                            razon: !e.tags.website ? 'Sin presencia web. Alto potencial de captacion.' : 'Tiene web pero puede mejorar SEO y conversion local.',
                                            fuente: 'OpenStreetMap',
                                            direccion: [e.tags['addr:street'], e.tags['addr:housenumber'], e.tags['addr:city']].filter(Boolean).join(', ') || zona
                                        }))
                                        .slice(0, 12);
                                    sendJson(res, 200, { leads, source: 'OpenStreetMap' });
                                } catch (e2) {
                                    sendJson(res, 502, { error: 'Error procesando datos de OpenStreetMap' });
                                }
                            });
                        });
                        ovReq.on('error', e => sendJson(res, 502, { error: 'Overpass no disponible: ' + e.message }));
                        ovReq.setTimeout(25000, () => { ovReq.destroy(); });
                        ovReq.write(overpassBody);
                        ovReq.end();
                    } catch (e2) {
                        sendJson(res, 500, { error: e2.message });
                    }
                });
            });
            geoReq.on('error', e => sendJson(res, 502, { error: 'Nominatim no disponible: ' + e.message }));
            geoReq.end();
        } catch (e) {
            sendJson(res, 500, { error: e.message });
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
