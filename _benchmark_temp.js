
    const path = require('path');
    const fs = require('fs');
    
    const results = [];
    
    function measureLoad(label, modulePath) {
        const start = process.hrtime.bigint();
        try {
            const mod = require(modulePath);
            const end = process.hrtime.bigint();
            const ms = Number(end - start) / 1_000_000;
            results.push({ label, ms, status: 'ok' });
            if (ms > 50) console.log(`[LENTO] ${label}: ${ms.toFixed(2)}ms`);
        } catch (e) {
            const end = process.hrtime.bigint();
            const ms = Number(end - start) / 1_000_000;
            results.push({ label, ms, status: `erro: ${e.message.slice(0,60)}` });
        }
    }
    
    // Caminhos para testar
    const base = __dirname;
    const paths = [
        // Modulos core
        { label: 'core/index', path: path.join(base, 'core', 'index.js') },
        { label: 'core/agent', path: path.join(base, 'core', 'agent.js') },
        { label: 'core/orchestrator', path: path.join(base, 'core', 'orchestrator.js') },
        { label: 'core/memory', path: path.join(base, 'core', 'memory.js') },
        { label: 'core/tool-registry', path: path.join(base, 'core', 'tool-registry.js') },
        // Modulos src
        { label: 'src/index', path: path.join(base, 'src', 'index.js') },
        // Dependencias externas comuns
        { label: 'chalk', path: 'chalk' },
        { label: 'express', path: 'express' },
    ];
    
    for (const p of paths) {
        if (fs.existsSync(p.path) || p.path === p.label) {
            measureLoad(p.label, p.path.startsWith('.') ? p.path : p.label);
        } else {
            // Try .ts extension or dist
            const tsPath = p.path.replace('.js', '.ts');
            if (fs.existsSync(tsPath)) {
                measureLoad(p.label + ' (.ts)', tsPath);
            } else {
                results.push({ label: p.label, ms: -1, status: 'arquivo nao encontrado' });
            }
        }
    }
    
    console.log('\n=== RESULTADOS ===');
    console.log(JSON.stringify(results, null, 2));
    