const fs = require('fs');
let c = fs.readFileSync('workweb_agents.html', 'utf8');

const startMarker = 'function buildTemplateDemo(l, contexto = {}) {';
const endMarker = 'async function generateDemoForLead(l, opts = {}) {';

let startIdx = c.indexOf(startMarker);
let endIdx = c.indexOf(endMarker, startIdx);

if (startIdx !== -1 && endIdx !== -1) {
    let block = c.substring(startIdx, endIdx);
    
    // Undo any previous partial fixes to have a clean slate
    block = block.replace(/\${'<script'}>/g, "<script>"); // handled old version
    block = block.replace(/\${'<\/script'}>/g, "</script>"); // handled old version
    block = block.replace(/\${'<script>'}/g, "<script>");
    block = block.replace(/\${'<\/script>'}/g, "</script>");
    block = block.replace(/\${'<\/html>'}/g, "</html>");
    block = block.replace(/\${'<\/body>'}/g, "</body>");
    block = block.replace(/<\\\/script>/g, "</script>");
    
    // Now apply the REAL fix that breaks the character sequence in the .html file
    // The HTML parser scans for "</script>" literal string.
    block = block.replace(/<script>/g, "${'<sc' + 'ript>'}");
    block = block.replace(/<\/script>/g, "${'</' + 'script>'}");
    
    // Do the same for body/html just in case
    block = block.replace(/<\/body>/g, "${'</' + 'body>'}");
    block = block.replace(/<\/html>/g, "${'</' + 'html>'}");

    c = c.substring(0, startIdx) + block + c.substring(endIdx);
    fs.writeFileSync('workweb_agents.html', c, 'utf8');
    console.log('Fixed buildTemplateDemo block with character-breaking sequences.');
} else {
    console.log('Markers not found.');
}
