
    import * as ts from "typescript";
    import * as fs from "fs";
    
    const filePath = "C:\\Developer\\colabor-ai\\core\\orchestrator\\orchestrator.ts";
    const sourceCode = fs.readFileSync(filePath, "utf-8");
    
    const sourceFile = ts.createSourceFile(
        "orchestrator.ts",
        sourceCode,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS
    );
    
    // Get parse diagnostics
    const diags = sourceFile.parseDiagnostics.filter(d => d);
    console.log("Parse errors:", diags.length);
    for (const d of diags) {
        const msg = ts.flattenDiagnosticMessageText(d.messageText);
        const pos = sourceFile.getLineAndCharacterOfPosition(d.start);
        console.log(`  Line ${pos.line + 1}, Col ${pos.character + 1}: ${msg}`);
    }
    
    // Also walk all nodes and count balanced braces
    let openBrackets = 0;
    let openBraces = 0;
    let openParens = 0;
    
    function countBrackets(text) {
        for (const ch of text) {
            if (ch === "{") openBraces++;
            if (ch === "}") openBraces--;
            if (ch === "[") openBrackets++;
            if (ch === "]") openBrackets--;
            if (ch === "(") openParens++;
            if (ch === ")") openParens--;
        }
    }
    
    // Simple approach: strip strings, comments, regex, templates, then count
    let cleaned = "";
    let inStr = false;
    let inTmpl = false;
    let inBlock = false;
    let strChar = "";
    
    for (let i = 0; i < sourceCode.length; i++) {
        const ch = sourceCode[i];
        const nxt = sourceCode[i + 1] || "";
        
        if (!inStr && !inTmpl && ch === "/" && nxt === "/") {
            while (i < sourceCode.length && sourceCode[i] !== "\n") i++;
            continue;
        }
        if (!inStr && !inTmpl && ch === "/" && nxt === "*") {
            inBlock = true;
            i += 2;
            continue;
        }
        if (inBlock) {
            if (ch === "*" && nxt === "/") { inBlock = false; i++; }
            continue;
        }
        if (!inStr && !inTmpl && !inBlock && (ch === '"' || ch === "'")) {
            inStr = true;
            strChar = ch;
            continue;
        }
        if (inStr) {
            if (ch === "\\" && sourceCode[i + 1]) { i++; continue; }
            if (ch === strChar) { inStr = false; }
            continue;
        }
        if (!inStr && !inBlock && ch === "`") {
            inTmpl = !inTmpl;
            continue;
        }
        if (inTmpl) {
            if (ch === "$" && nxt === "{") {
                cleaned += "{";
                i++;
                continue;
            }
            if (ch === "}") {
                // Could be closing template expression or just a char
                // We'll add it and let the counter figure out
                cleaned += "}";
                continue;
            }
            continue;
        }
        
        cleaned += ch;
    }
    
    // Now cleaned has only non-string/template/comment code
    for (const ch of cleaned) {
        if (ch === "{") openBraces++;
        if (ch === "}") openBraces--;
        if (ch === "[") openBrackets++;
        if (ch === "]") openBrackets--;
        if (ch === "(") openParens++;
        if (ch === ")") openParens--;
    }
    
    console.log("After cleaning strings/comments/templates:");
    console.log("  Braces {}: " + openBraces);
    console.log("  Brackets []: " + openBrackets);
    console.log("  Parens (): " + openParens);
    