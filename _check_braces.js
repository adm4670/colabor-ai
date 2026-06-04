
    const fs = require('fs');
    const path = "C:\\Developer\\colabor-ai\\core\\orchestrator\\orchestrator.ts";
    const content = fs.readFileSync(path, 'utf-8');
    
    let bal = 0;
    let inStr = false;
    let inTmpl = false;
    let strChar = '';
    
    for (let i = 0; i < content.length; i++) {
        const ch = content[i];
        const next = content[i+1] || '';
        
        // Single line comments
        if (!inStr && !inTmpl && ch === '/' && next === '/') {
            while (i < content.length && content[i] !== '\n') i++;
            continue;
        }
        // Block comments
        if (!inStr && !inTmpl && ch === '/' && next === '*') {
            i += 2;
            while (i < content.length && !(content[i] === '*' && content[i+1] === '/')) i++;
            i++;
            continue;
        }
        
        // String literals
        if (!inStr && !inTmpl && (ch === '"' || ch === "'")) {
            inStr = true;
            strChar = ch;
            continue;
        }
        if (inStr && ch === '\\' && content[i+1]) { i += 2; continue; }
        if (inStr && ch === strChar) { inStr = false; continue; }
        if (inStr) continue;
        
        // Template literals
        if (!inStr && ch === '`') { inTmpl = !inTmpl; continue; }
        if (inTmpl) {
            if (ch === '\\' && content[i+1]) { i += 2; continue; }
            if (ch === '$' && next === '{') {
                bal++;
                i += 2;
                let depth = 1;
                while (i < content.length && depth > 0) {
                    if (content[i] === '{') depth++;
                    if (content[i] === '}') depth--;
                    if (content[i] === '\\' && content[i+1]) i++;
                    i++;
                }
                i--;
                continue;
            }
            continue;
        }
        
        // Regular braces
        if (ch === '{') bal++;
        if (ch === '}') bal--;
    }
    
    console.log('Balance:', bal);
    console.log('Balanced:', bal === 0);
    