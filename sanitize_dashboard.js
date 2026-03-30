const fs = require('fs');
let c = fs.readFileSync('workweb_agents.html', 'utf8');

const startMarker = 'function buildTemplateDemo(l, contexto = {}) {';
const endMarker = 'async function generateDemoForLead(l, opts = {}) {';

let startIdx = c.indexOf(startMarker);
let endIdx = c.indexOf(endMarker, startIdx);

if (startIdx !== -1 && endIdx !== -1) {
    let block = c.substring(startIdx, endIdx);
    
    // Replace all < with \x3C and all > with \x3E inside the return template literal
    // This is the ultimate way to hide HTML from the browser's script parser.
    const returnIdx = block.indexOf('return `');
    if (returnIdx !== -1) {
        let header = block.substring(0, returnIdx + 8);
        let template = block.substring(returnIdx + 8);
        
        // Find the closing backtick of the template
        let closingTickIdx = template.lastIndexOf('`;');
        if (closingTickIdx !== -1) {
            let body = template.substring(0, closingTickIdx);
            let footer = template.substring(closingTickIdx);
            
            // Sanitize body: remove any previous interpolated fixes and use hex escapes for tags
            body = body.replace(/\${'<script>'}/g, '<script>')
                       .replace(/\${'<\/script>'}/g, '</script>')
                       .replace(/\${'<sc' \+ 'ript>'}/g, '<script>')
                       .replace(/\${'<\/sc' \+ 'ript>'}/g, '</script>')
                       .replace(/\${'<\/body>'}/g, '</body>')
                       .replace(/\${'<\/html>'}/g, '</html>')
                       .replace(/\${'<\/body'}/g, '</body>')
                       .replace(/\${'<\/html'}/g, '</html>')
                       .replace(/\${'<\/script'}/g, '</script>')
                       .replace(/\${'<sc' \+ 'ript'}/g, '<script>');
            
            // Hex escape all < and > to be 100% invisible to HTML parser
            body = body.replace(/</g, '\\x3C').replace(/>/g, '\\x3E');
            
            block = header + body + footer;
        }
    }

    c = c.substring(0, startIdx) + block + c.substring(endIdx);
    fs.writeFileSync('workweb_agents.html', c, 'utf8');
    console.log('Sanitized buildTemplateDemo with hex escapes.');
} else {
    console.log('Markers not found.');
}
