import re

filepath = r'c:\Desktop\WORKWEB\workweb_agents.html'
c = open(filepath, encoding='utf-8').read()

# 1. Replace provider selector block with simple API Key button
c = re.sub(
    r'<div style="display:flex;gap:10px;margin-left:auto;align-items:center">.*?</div>\s*</div>',
    '''<div style="display:flex;gap:10px;margin-left:auto;align-items:center">
      <button class="btn btn-ghost btn-sm" onclick="changeApiKey()" style="font-size:11px;padding:5px 10px;border-color:rgba(255,255,255,0.15);color:var(--dim)">&#128273; API Key</button>
    </div>
  </div>''',
    c, count=1, flags=re.DOTALL
)

# 2. Remove the Ollama setup banner
c = re.sub(
    r'\s*<div id="ai-setup-banner"[^>]*>.*?</div>\s*</div>\s*\n',
    '\n',
    c, count=1, flags=re.DOTALL
)

# 3. Fix legacy storage
c = c.replace(
    "const primary = localStorage.getItem('ww-leads-local');\n        const legacy = localStorage.getItem('ww-leads-ollama');\n        const raw = primary || legacy;",
    "const raw = localStorage.getItem('ww-leads-local');"
)

# 4. Replace the entire AI engine block (OPENAI_MODELS through aiChat) with Claude functions
old_engine_start = '    const OPENAI_MODELS = ['
old_engine_end = '    async function aiChat(messages, sys) {'

# Find where this block starts and ends
start_idx = c.find(old_engine_start)
end_search = c.find(old_engine_end, start_idx)
# find closing brace of aiChat
brace_count = 0
pos = end_search + len(old_engine_end)
inside = False
for i, ch in enumerate(c[end_search:], start=end_search):
    if ch == '{':
        brace_count += 1
        inside = True
    elif ch == '}':
        brace_count -= 1
        if inside and brace_count == 0:
            end_idx = i + 1
            break

claude_block = '''    // ==================== API (CLAUDE) ====================
    async function claude({ sys, msg, search = false }) {
      let key = localStorage.getItem('ww_api_key');
      if (!key) {
        key = prompt('Pega tu API Key de Anthropic (Claude) para activar los Agentes:');
        if (!key) throw new Error('Falta API Key de Anthropic.');
        localStorage.setItem('ww_api_key', key.trim());
      }
      const body = {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1500,
        system: sys,
        messages: [{ role: 'user', content: msg }]
      };
      if (search) body.tools = [{ type: 'web_search_20250305', name: 'web_search' }];
      const cleanKey = key.replace(/[^\\x20-\\x7E]/g, '').trim();
      const endpoint = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        ? '/api/anthropic' : 'https://api.anthropic.com/v1/messages';
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': cleanKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerously-allow-browser': 'true'
        },
        body: JSON.stringify(body)
      });
      if (!r.ok) {
        let errText = 'HTTP ' + r.status;
        try { const e = await r.json(); errText = e.error?.message || errText; } catch (_) {}
        throw new Error(errText);
      }
      return r.json();
    }

    function changeApiKey() {
      const k = prompt('Introduce tu nueva API Key de Anthropic:');
      if (k) { localStorage.setItem('ww_api_key', k.trim()); toast('API Key actualizada', 'success'); }
    }

    async function claudeChat(messages, sys) {
      let key = localStorage.getItem('ww_api_key');
      if (!key) throw new Error('Falta API Key. Pulsa el boton API Key en el header.');
      const body = { model: 'claude-3-5-sonnet-20241022', max_tokens: 1500, system: sys, messages };
      const cleanKey = key.replace(/[^\\x20-\\x7E]/g, '').trim();
      const endpoint = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        ? '/api/anthropic' : 'https://api.anthropic.com/v1/messages';
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': cleanKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerously-allow-browser': 'true'
        },
        body: JSON.stringify(body)
      });
      if (!r.ok) throw new Error('Error al conectar con Claude Chat');
      return r.json();
    }

    function getText(d) {
      return d?.content?.filter(b => b.type === 'text').map(b => b.text).join('\\n') || '';
    }

    // aiReq / aiChat are aliases for backwards compat with agents
    async function aiReq({ sys, msg }) {
      const d = await claude({ sys, msg });
      return getText(d);
    }
    async function aiChat(messages, sys) {
      return claudeChat(messages, sys);
    }
'''

if start_idx != -1 and end_idx > start_idx:
    c = c[:start_idx] + claude_block + c[end_idx:]
    print('Engine block replaced successfully')
else:
    print('WARNING: Could not find engine block to replace')

open(filepath, 'w', encoding='utf-8').write(c)
print('Done. Final size:', len(c))
