const fs = require('fs');
const c = fs.readFileSync('workweb_agents.html', 'utf8');

const sIdx = c.indexOf('<script>');
const eIdx = c.lastIndexOf('</script>');

if (sIdx === -1 || eIdx === -1) {
    console.error('ERROR: Script markers not found!');
    process.exit(1);
}

const s = c.substring(sIdx + 8, eIdx);
let count = 0;
for (let i = 0; i < s.length; i++) {
    if (s[i] === '`') {
        // Check if it is escaped
        if (i > 0 && s[i-1] === '\\') continue;
        count++;
    }
}

console.log('Total unescaped backticks in main script:', count);
if (count % 2 !== 0) {
    console.log('--- ERROR: ODD NUMBER OF BACKTICKS DETECTED! ---');
    
    // Let's find the unclosed block
    let openTickLine = -1;
    let isOpen = false;
    const lines = s.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        for (let j = 0; j < line.length; j++) {
            if (line[j] === '`' && (j === 0 || line[j-1] !== '\\')) {
                isOpen = !isOpen;
                if (isOpen) openTickLine = i + sIdx.split('\n').length + 1; // Approximate
            }
        }
    }
    console.log('Script likely breaks around an unclosed backtick.');
} else {
    console.log('Backticks are balanced.');
}

// Check for literal </script> inside strings that might have missed the previous fix
const regex = /<\/script>/g;
let match;
while ((match = regex.exec(s)) !== null) {
    console.log('Found literal </script> at position', match.index, 'in script block');
}
