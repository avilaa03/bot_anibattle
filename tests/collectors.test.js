/**
 * Guarda contra dois erros que já quebraram comandos em produção.
 *
 * 1. Módulo de collect marcado como `async` mas cujo retorno é usado como
 *    coletor. Uma função async devolve Promise, então `collector.on(...)`
 *    estoura "collector.on is not a function". Foi o que derrubou o
 *    /inventory e o /favcard.
 *
 * 2. Uso de `fetchReply: true`, que está deprecado no discord.js e imprime
 *    aviso no console a cada execução.
 *
 * Os testes leem o código-fonte, então não precisam de Discord nem banco.
 */

const fs = require('fs');
const path = require('path');

let falhas = 0;
function check(nome, cond, extra = '') {
    console.log(`  ${cond ? 'OK  ' : 'FALHOU'} ${nome} ${extra}`);
    if (!cond) falhas++;
}

const RAIZ = path.join(__dirname, '..');
const DIR_COLLECT = path.join(RAIZ, 'Commands', 'actions', 'collect');

function listarJs(dir) {
    const saida = [];
    for (const nome of fs.readdirSync(dir)) {
        const p = path.join(dir, nome);
        if (fs.statSync(p).isDirectory()) saida.push(...listarJs(p));
        else if (nome.endsWith('.js')) saida.push(p);
    }
    return saida;
}

console.log('=== Módulo que devolve coletor não pode ser async ===');
const problemas = [];
for (const arquivo of listarJs(DIR_COLLECT)) {
    const src = fs.readFileSync(arquivo, 'utf8');
    const devolveColetor = /return\s+collector\s*;/.test(src);
    const ehAsync = /module\.exports\s*=\s*async\s*\(/.test(src);
    if (devolveColetor && ehAsync) {
        problemas.push(path.relative(RAIZ, arquivo));
    }
}
check('nenhum módulo de collect é async devolvendo coletor', problemas.length === 0,
    problemas.length ? `-> ${problemas.join(', ')}` : `(${listarJs(DIR_COLLECT).length} arquivos verificados)`);

console.log('\n=== Chamadas que usam o retorno como coletor ===');
// Se um run/command faz `const collector = algoCollect(...)` sem await,
// o módulo chamado precisa ser síncrono.
const chamadores = [
    ...listarJs(path.join(RAIZ, 'Commands', 'actions', 'run')),
    ...listarJs(path.join(RAIZ, 'Commands', 'commands'))
];

const suspeitas = [];
for (const arquivo of chamadores) {
    const src = fs.readFileSync(arquivo, 'utf8');
    // const collector = xCollect(...)   — sem await
    const regex = /const\s+(?:collector|coletor)\s*=\s*(?!await\b)(\w*[Cc]ollect)\s*\(/g;
    for (const m of src.matchAll(regex)) {
        const nomeModulo = m[1];
        // Descobre o arquivo do módulo chamado.
        const candidatos = listarJs(DIR_COLLECT).filter((f) =>
            path.basename(f, '.js').toLowerCase() === nomeModulo.toLowerCase()
        );
        for (const cand of candidatos) {
            if (/module\.exports\s*=\s*async\s*\(/.test(fs.readFileSync(cand, 'utf8'))) {
                suspeitas.push(`${path.relative(RAIZ, arquivo)} chama ${nomeModulo} (async) sem await`);
            }
        }
    }
}
check('nenhuma chamada sem await para módulo async', suspeitas.length === 0,
    suspeitas.length ? `-> ${suspeitas.join('; ')}` : '');

console.log('\n=== fetchReply está deprecado ===');
const comFetchReply = [];
for (const dir of ['Commands', 'scripts']) {
    for (const arquivo of listarJs(path.join(RAIZ, dir))) {
        const src = fs.readFileSync(arquivo, 'utf8');
        if (/fetchReply:\s*true/.test(src)) comFetchReply.push(path.relative(RAIZ, arquivo));
    }
}
check('nenhum uso de "fetchReply: true"', comFetchReply.length === 0,
    comFetchReply.length ? `-> ${comFetchReply.join(', ')}` : '');

console.log('\n=== Comandos registrados têm arquivo de execução ===');
const dirComandos = path.join(RAIZ, 'Commands', 'commands');
const semRun = [];
for (const arquivo of listarJs(dirComandos)) {
    const src = fs.readFileSync(arquivo, 'utf8');
    for (const m of src.matchAll(/require\(['"](\.\.[^'"]+)['"]\)/g)) {
        const destino = path.resolve(path.dirname(arquivo), m[1]);
        if (!fs.existsSync(destino) && !fs.existsSync(destino + '.js')) {
            semRun.push(`${path.basename(arquivo)} -> ${m[1]}`);
        }
    }
}
check('todos os imports dos comandos resolvem', semRun.length === 0,
    semRun.length ? `-> ${semRun.join(', ')}` : `(${listarJs(dirComandos).length} comandos)`);

console.log(falhas === 0 ? '\n*** TODOS OS TESTES DE COLETOR PASSARAM ***' : `\n*** ${falhas} FALHA(S) ***`);
process.exit(falhas ? 1 : 0);
