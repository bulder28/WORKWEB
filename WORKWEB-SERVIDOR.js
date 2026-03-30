const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');

const PORT = 8002;
const DIR = __dirname;

// ==================== CARGAR API KEY DESDE .env ====================
function loadApiKey() {
    const envPath = path.join(DIR, '.env');
    try {
        if (fs.existsSync(envPath)) {
            const lines = fs.readFileSync(envPath, 'utf8').split('\n');
            for (const line of lines) {
                const [k, ...v] = line.split('=');
                if (k && k.trim() === 'ANTHROPIC_API_KEY') {
                    return v.join('=').trim().replace(/^["']|["']$/g, '');
                }
            }
        }
    } catch (_) {}
    return process.env.ANTHROPIC_API_KEY || '';
}
let SAVED_API_KEY = loadApiKey();
if (SAVED_API_KEY) {
    console.log('  🔑  API Key cargada desde .env');
} else {
    console.log('  ⚠️   Sin API Key en .env — crea el archivo con: ANTHROPIC_API_KEY=sk-ant-...');
}

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

    // ==================== CONFIG: devolver API key al frontend ====================
    if (req.url === '/api/config' && req.method === 'GET') {
        SAVED_API_KEY = loadApiKey(); // reload in case it changed
        sendJson(res, 200, { apiKey: SAVED_API_KEY });
        return;
    }

    // ==================== GUARDAR API KEY en .env ====================
    if (req.url === '/api/savekey' && req.method === 'POST') {
        try {
            const rawBody = await readBody(req);
            const { apiKey } = JSON.parse(rawBody || '{}');
            if (!apiKey || !apiKey.startsWith('sk-ant-')) {
                sendJson(res, 400, { error: 'API Key no válida (debe empezar por sk-ant-)' });
                return;
            }
            const envPath = path.join(DIR, '.env');
            fs.writeFileSync(envPath, `ANTHROPIC_API_KEY=${apiKey.trim()}\n`, 'utf8');
            SAVED_API_KEY = apiKey.trim();
            console.log('  🔑  API Key guardada en .env ✓');
            sendJson(res, 200, { ok: true });
        } catch (e) {
            sendJson(res, 500, { error: e.message });
        }
        return;
    }

    // ==================== GUARDAR DEMO HTML EN DISCO ====================
    if (req.url === '/api/save-demo' && req.method === 'POST') {
        try {
            const rawBody = await readBody(req);
            const { html, name } = JSON.parse(rawBody || '{}');
            if (!html) { sendJson(res, 400, { error: 'HTML requerido' }); return; }
            const demosDir = path.join(DIR, 'demos');
            if (!fs.existsSync(demosDir)) fs.mkdirSync(demosDir);
            const slug = (name || 'demo').toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').slice(0, 40);
            const filename = slug + '.html';
            fs.writeFileSync(path.join(demosDir, filename), html, 'utf8');
            sendJson(res, 200, { ok: true, url: '/demos/' + filename });
        } catch (e) {
            sendJson(res, 500, { error: e.message });
        }
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

    // ==================== BUSINESS INTEL — Claude web_search (gratis, busca en todo) ====================
    if (req.url === '/api/business-intel' && req.method === 'POST') {
        try {
            const rawBody = await readBody(req);
            const { nombre, sector, zona, web } = JSON.parse(rawBody || '{}');

            // Leer API key
            const apiKey = SAVED_API_KEY || '';
            if (!apiKey) {
                sendJson(res, 200, {
                    ok: true, nombre, sector, zona,
                    summary: `Negocio: ${nombre} (${sector}) en ${zona}, Toledo.`,
                    sources: []
                });
                return;
            }

            // Scrape web propia si existe (esto siempre funciona)
            let webData = null;
            if (web) {
                const webUrl = web.startsWith('http') ? web : 'https://' + web;
                try {
                    const webHtml = await new Promise((resolve) => {
                        const u = new URL(webUrl);
                        const client = u.protocol === 'https:' ? https : http;
                        const r = client.request(webUrl, {
                            method: 'GET',
                            headers: { 'User-Agent': 'Mozilla/5.0 Chrome/120.0.0.0 Safari/537.36', 'Accept': 'text/html' }
                        }, res => {
                            let body = '';
                            res.on('data', c => { if (body.length < 60000) body += c.toString(); });
                            res.on('end', () => resolve(body));
                        });
                        r.on('error', () => resolve(''));
                        r.setTimeout(8000, () => { r.destroy(); resolve(''); });
                        r.end();
                    });
                    if (webHtml) {
                        const clean = webHtml.replace(/<script[^>]*>.*?<\/script>/gis, '')
                            .replace(/<style[^>]*>.*?<\/style>/gis, '')
                            .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
                        const titleM = webHtml.match(/<title[^>]*>([^<]+)<\/title>/i);
                        const descM = webHtml.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i);
                        webData = {
                            title: titleM ? titleM[1].trim() : '',
                            description: descM ? descM[1].trim() : '',
                            text: clean.slice(0, 1500)
                        };
                    }
                } catch (_) {}
            }

            // Usar Claude con web_search para buscar info real del negocio
            const searchPrompt = `Busca informacion REAL sobre este negocio local en internet:
Nombre: ${nombre}
Sector: ${sector}
Zona: ${zona}, Toledo, España

Busca en Google Maps, TripAdvisor, Yelp, Facebook, y cualquier directorio o web donde aparezca este negocio.

Devuelve SOLO un JSON valido con esta estructura exacta (sin texto antes ni despues):
{
  "encontrado": true o false,
  "rating": "4.3" o null,
  "num_resenas": "127" o null,
  "telefono": "925123456" o null,
  "horario": "Lunes a viernes 9:00-21:00" o null,
  "direccion": "Calle Mayor 5, Illescas" o null,
  "descripcion": "descripcion real del negocio encontrada online" o null,
  "resenas": ["texto literal de resena 1", "texto literal de resena 2", "texto literal de resena 3"],
  "especialidades": ["especialidad 1", "especialidad 2"],
  "fuentes": ["Google Maps", "TripAdvisor"],
  "resumen": "parrafo completo con todo lo que sabes de este negocio basado en lo encontrado online"
}`;

            const claudeBody = JSON.stringify({
                model: 'claude-3-5-sonnet-20241022',
                max_tokens: 2000,
                tools: [{ type: 'web_search_20250305', name: 'web_search' }],
                betas: ['web-search-2025-03-05'],
                messages: [{ role: 'user', content: searchPrompt }]
            });

            const claudeResp = await new Promise((resolve, reject) => {
                const r = https.request('https://api.anthropic.com/v1/messages', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': apiKey,
                        'anthropic-version': '2023-06-01'
                    }
                }, res => {
                    let body = '';
                    res.on('data', c => body += c);
                    res.on('end', () => {
                        try { resolve(JSON.parse(body)); }
                        catch { resolve(null); }
                    });
                });
                r.on('error', reject);
                r.setTimeout(30000, () => { r.destroy(); reject(new Error('timeout')); });
                r.write(claudeBody);
                r.end();
            });

            // Extraer texto de la respuesta de Claude
            let parsed = null;
            if (claudeResp?.content) {
                const textBlocks = claudeResp.content.filter(b => b.type === 'text').map(b => b.text).join('');
                // Intentar parsear JSON de la respuesta
                const jsonMatch = textBlocks.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    try { parsed = JSON.parse(jsonMatch[0]); } catch (_) {}
                }
            }

            // Construir resultado final
            const results = {
                ok: true,
                nombre, sector, zona,
                sources: [],
                web: webData
            };

            if (parsed) {
                results.google = {
                    rating: parsed.rating || null,
                    phone: parsed.telefono || null,
                    schedule: parsed.horario || null,
                    address: parsed.direccion || null,
                    snippets: parsed.descripcion ? [parsed.descripcion] : []
                };
                results.tripadvisor = {
                    reviews: Array.isArray(parsed.resenas) ? parsed.resenas.filter(r => r && r.length > 20).slice(0, 4) : [],
                    dishes: Array.isArray(parsed.especialidades) ? parsed.especialidades.slice(0, 8) : [],
                    rating: parsed.rating || null
                };
                if (Array.isArray(parsed.fuentes)) results.sources = parsed.fuentes;

                // Summary rico
                const parts = [`Negocio: ${nombre} (${sector}) en ${zona}, Toledo.`];
                if (parsed.rating) parts.push(`Valoracion: ${parsed.rating}/5 (${parsed.num_resenas || '?'} resenas).`);
                if (parsed.horario) parts.push(`Horario: ${parsed.horario}.`);
                if (parsed.direccion) parts.push(`Direccion: ${parsed.direccion}.`);
                if (parsed.descripcion) parts.push(parsed.descripcion);
                if (parsed.resenas?.length) {
                    parts.push('Resenas reales: ' + parsed.resenas.slice(0,3).map(r => '"' + r + '"').join(' | '));
                }
                if (parsed.especialidades?.length) {
                    parts.push('Especialidades: ' + parsed.especialidades.join(', ') + '.');
                }
                if (parsed.resumen) parts.push(parsed.resumen);
                results.summary = parts.join(' ');
            } else {
                // Fallback sin datos de Claude
                const wParts = [`Negocio: ${nombre} (${sector}) en ${zona}, Toledo.`];
                if (webData?.description) wParts.push(webData.description);
                if (webData?.text) wParts.push(webData.text.slice(0, 500));
                results.summary = wParts.join(' ');
                results.sources = webData ? ['web propia'] : [];
            }

            console.log(`[Business Intel] ${nombre} — rating: ${parsed?.rating || 'no encontrado'} — resenas: ${parsed?.resenas?.length || 0} — fuentes: ${results.sources.join(', ') || 'ninguna'}`);
            sendJson(res, 200, results);

        } catch (e) {
            console.error('[Business Intel] Error:', e.message);
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
