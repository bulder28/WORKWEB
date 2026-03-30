const fs = require('fs');
let content = fs.readFileSync('workweb_agents.html', 'utf8');

const startMarker = 'async function generateDemoForLead(l, opts = {}) {';
const endMarker = 'async function runLeadAutoflow(leadId) {';

const startIdx = content.indexOf(startMarker);
const endIdx = content.indexOf(endMarker);

if (startIdx === -1 || endIdx === -1) {
  console.error('Markers not found!');
  process.exit(1);
}

const cleanBlock = `async function generateDemoForLead(l, opts = {}) {
      const contexto = opts.context || getDevContext();
      const st = document.getElementById('dev-status');
      if (st) {
        st.style.display = 'flex';
        st.innerHTML = \`<span class="spin"></span>&nbsp;Generando HTML de la demo web para \${l.nombre}...\`;
      }
      document.getElementById('dev-result').style.display = 'none';

      function assessDemoQuality(html) {
        const lower = String(html || '').toLowerCase();
        const checks = [
          lower.includes('<!doctype html'),
          lower.includes('<section'),
          lower.includes('<style'),
          lower.includes('linear-gradient') || lower.includes('gradient'),
          lower.includes('@media'),
          lower.includes('cta') || lower.includes('reserv') || lower.includes('llama') || lower.includes('contacta'),
          lower.includes('testimonial') || lower.includes('opinion') || lower.includes('rese') || lower.includes('confian'),
          lower.includes('hero'),
          lower.includes('whatsapp') || lower.includes('tel:'),
          lower.includes('google') || lower.includes('map') || lower.includes('ubicacion')
        ];
        return checks.filter(Boolean).length;
      }

      const sys = \`Eres un Director de Arte Frontend Senior nivel "Awwwards" y desarrollador de WorkWeb Solutions.
Devuelve SOLO un archivo HTML completo y perfecto con CSS embebido (Vanilla CSS) y JS minimo. SIN EXPLICACIONES.

REQUISITOS OBLIGATORIOS DE DISEÑO (NIVEL LUXURY/PREMIUM):
- Usa fuentes de Google Fonts espectaculares (ej. 'Outfit', 'Playfair Display', 'Inter', 'Syne'). NUNCA Arial.
- Incorpora Micro-Animaciones CSS (keyframes, transform: translateY, hover scales, fade in) en botones, tarjetas y al cargar la pagina. La web debe sentirse "viva".
- Estructura moderna con Grid y Flexbox. Mucho espacio en blanco, tarjetas con bordes redondeados (16px+), sombras suaves (box-shadow premium), y fondos con gradientes o glassmorphism (backdrop-filter: blur).
- Imagenes fotograficas impactantes: DEBES usar URLs reales de Unsplash para los fondos o fotos de servicios. Busca tematicamente segun el negocio.
- NO uses colores puros genericos. Usa paletas seleccionadas ricas (Navy profundo, Esmeralda moderno, Oro elegante, Naranja vibrante).
- Estructura integral: Nav fijo con efecto blur al scrollear, Hero inmersivo de pantalla completa, Stats, Servicios en Cards dinamicas, CTA gigante y Footer corporativo limpio.
- Copy super persuasivo orientado a la conversion local en \${l.zona}. NO uses Lorem Ipsum.
- Muestra el telefono de contacto claramente con llamadas a la accion directas.

ESTILO VISUAL A RESPETAR: \${contexto.estilo}.

CALIDAD EXTREMA OBLIGATORIA:
La estetica es CRITICA. Tu objetivo es una demo que parezca de una agencia de diseno digital top level.\`;

      const msg = \`Crea una landing page profesional para:
Negocio: \${l.nombre}
Sector: \${l.sector}
Zona: \${l.zona}
Telefono: \${l.telefono || '925 XXX XXX'}
\${l.web ? 'Web actual: ' + l.web : ''}
\${l.researchSummary ? 'Informacion investigada del negocio:\\n' + l.researchSummary : ''}
\${contexto.extra ? 'Servicios adicionales: ' + contexto.extra : ''}

Pistas de contenido:
- Si es hosteleria, prioriza reservas, ambiente, carta y ubicacion
- Si es servicio local, prioriza confianza, rapidez, zona de cobertura y llamada a la accion
- Usa textos y secciones adaptadas al sector exacto\`;

      try {
        let html = await aiReq({ sys, msg, maxTokens: 6000 });
        html = html.replace(/^\`\`\`html\\s*/i, '').replace(/\`\`\`\\s*$/, '').trim();

        if (!html.includes('<html')) throw new Error('El modelo no devolvio un HTML valido. Intentalo de nuevo.');

        if (assessDemoQuality(html) < 7) {
          const retrySys = sys + '\\n\\nREINTENTO OBLIGATORIO: La version anterior fue demasiado pobre. Sube mucho el nivel visual y comercial.';
          const retryMsg = msg + '\\n\\nMejora obligatoria: mas impacto visual, mejor jerarquia, secciones mas solidas, CTA mas creibles y apariencia moderna.';
          html = await aiReq({ sys: retrySys, msg: retryMsg, maxTokens: 6000 });
          html = html.replace(/^\`\`\`html\\s*/i, '').replace(/\`\`\`\\s*$/, '').trim();
        }

        if (assessDemoQuality(html) < 7) {
          html = buildTemplateDemo(l, contexto);
        }

        demoHTML = html;
        document.getElementById('dev-nombre-label').textContent = l.nombre;
        const frame = document.getElementById('demo-frame');
        try {
          const saveRes = await fetch('/api/save-demo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ html, name: l.nombre })
          });
          if (saveRes.ok) {
            const { url } = await saveRes.json();
            frame.src = url + '?t=' + Date.now();
            document.getElementById('dev-url-bar').textContent = 'localhost:8002' + url;
          } else { throw new Error('save failed'); }
        } catch (_) {
          frame.removeAttribute('src');
          frame.srcdoc = html;
        }
        document.getElementById('dev-result').style.display = 'block';
        l.demoGenerated = true;
        registerActivity(l.id, 'demo', opts.activityText || 'Demo web generada para el lead');
        save();
        if (!opts.silent) toast('Demo web lista ✓', 'success');
        return html;
      } catch (e) {
        if (!opts.silent) toast('Error: ' + e.message, 'error');
        throw e;
      } finally {
        if (st) st.style.display = 'none';
      }
    }

    `;

const newContent = content.substring(0, startIdx) + cleanBlock + endMarker + content.substring(endIdx + endMarker.length);
fs.writeFileSync('workweb_agents.html', newContent, 'utf8');
console.log('Fixed! New file length:', newContent.length);
console.log('Lines:', newContent.split('\n').length);
