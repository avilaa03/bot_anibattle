/**
 * Todo `require()` relativo aponta para um arquivo que existe.
 *
 * ## Por que isto vale um teste
 *
 * Um require quebrado estoura no `node` — não é do tipo silencioso. Mas
 * ele estoura **quando a linha executa**, e nem toda linha executa em
 * todo teste: um comando que ninguém importa na suíte só quebraria em
 * produção, na primeira vez que um jogador o usasse.
 *
 * Este teste resolve os caminhos contra o disco sem executar nada, então
 * cobre inclusive os arquivos que a suíte não carrega — que é justamente
 * o caso do `canvas` neste projeto, cujo binário não compila em toda
 * máquina e impede requerer metade dos comandos.
 *
 * Foi escrito ao renomear os arquivos de comando para inglês, que é
 * exatamente o tipo de mudança em que um caminho fica para trás.
 */

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');

let falhas = 0;
function check(nome, condicao, detalhe = '') {
    if (condicao) {
        console.log(`  OK   ${nome} ${detalhe}`);
    } else {
        console.log(`  FALHOU ${nome} ${detalhe}`);
        falhas++;
    }
}

function varrer(dir, saida = []) {
    for (const nome of fs.readdirSync(dir)) {
        if (nome === 'node_modules' || nome === '.git' || nome === '.next') continue;
        const p = path.join(dir, nome);
        if (fs.statSync(p).isDirectory()) varrer(p, saida);
        else if (nome.endsWith('.js')) saida.push(p);
    }
    return saida;
}

/** Resolve como o Node resolve: com a extensão, sem ela, ou como pasta. */
function existe(destino) {
    const tentativas = [destino, `${destino}.js`, `${destino}.json`, path.join(destino, 'index.js')];
    return tentativas.some((t) => fs.existsSync(t));
}

const arquivos = varrer(RAIZ);
const quebrados = [];
let total = 0;

for (const arquivo of arquivos) {
    // Sem comentários: cabeçalhos citam caminhos como exemplo.
    const codigo = fs.readFileSync(arquivo, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');

    // O `(?<!['"\`])` descarta require que está DENTRO de outra string.
    // O `tests/convencoes.test.js` faz `src.includes("require('./vip")`
    // para provar que o motor de combate não importa VIP — é uma string,
    // não um import, e sem o lookbehind ela viraria um falso positivo.
    for (const m of codigo.matchAll(/(?<!['"`])require\(\s*['"](\.[^'"]+)['"]\s*\)/g)) {
        total++;
        const destino = path.resolve(path.dirname(arquivo), m[1]);
        if (!existe(destino)) {
            quebrados.push(`${path.relative(RAIZ, arquivo)} -> ${m[1]}`);
        }
    }
}

console.log('\n=== Todo require relativo resolve ===');
check('nenhum caminho quebrado', quebrados.length === 0,
    quebrados.length ? `\n       ${quebrados.join('\n       ')}` : `(${total} requires em ${arquivos.length} arquivos)`);

console.log('\n=== Nome de arquivo citado em string também existe ===');
//
// Nem toda referência a um arquivo passa por `require`. Alguns testes
// leem o fonte com `readFileSync(RUN + 'eventRun.js')` para provar uma
// convenção — e essa forma escapou da conferência acima quando os
// arquivos foram renomeados, quebrando a suíte só na hora de rodar.
const arquivosConhecidos = new Set();
for (const pasta of ['Commands/commands', 'Commands/actions/run', 'Commands/actions/collect',
    'Commands/actions/end', 'Commands/handlers', 'Commands/utils']) {
    const dir = path.join(RAIZ, pasta);
    if (!fs.existsSync(dir)) continue;
    for (const arquivo of fs.readdirSync(dir)) arquivosConhecidos.add(arquivo);
}

// Os testes montam o caminho por concatenação — `require(ROOT + 'bag.js')`.
// Nenhuma análise de require enxerga isso, então a conferência é pelo
// nome do arquivo: qualquer `'algo.js'` citado tem que existir numa das
// pastas acima.
const citadosInexistentes = [];
for (const arquivo of arquivos) {
    const codigo = fs.readFileSync(arquivo, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');

    for (const m of codigo.matchAll(/['"]([a-zA-Z][a-zA-Z0-9]*\.js)['"]/g)) {
        const nome = m[1];
        // `discord.js` e `index.js` não são arquivos deste projeto — o
        // primeiro é a biblioteca, o segundo mora na raiz. Sem esta
        // ressalva a conferência acusaria os dois em todo arquivo.
        if (nome === 'discord.js' || nome === 'index.js') continue;
        if (!arquivosConhecidos.has(nome)) {
            citadosInexistentes.push(`${path.relative(RAIZ, arquivo)} cita ${nome}`);
        }
    }
}
check('todo arquivo citado por nome existe', citadosInexistentes.length === 0,
    citadosInexistentes.length ? `\n       ${citadosInexistentes.join('\n       ')}` : '');

console.log('\n=== Nenhum arquivo de comando ficou com nome em português ===');
//
// O nome do arquivo não muda o comportamento — o carregador varre a
// pasta. É consistência: o canônico do comando é inglês, e o arquivo que
// o define devia dizer o mesmo.
const NOMES_PT = [
    'aprimorar', 'bolsa', 'caixa', 'colecionadores', 'conquistas', 'cosmeticos',
    'desejar', 'desejos', 'desmanchar', 'evento', 'ficha', 'idioma', 'loja',
    'magnata', 'missoes', 'torneio', 'treino', 'trocar'
];

const PASTAS = ['Commands/commands', 'Commands/actions/run', 'Commands/actions/collect', 'Commands/actions/end'];
const comNomePt = [];
for (const pasta of PASTAS) {
    const dir = path.join(RAIZ, pasta);
    if (!fs.existsSync(dir)) continue;
    for (const arquivo of fs.readdirSync(dir)) {
        const base = arquivo.replace(/(SlashCommand|Run|Collect|End)\.js$/, '');
        if (NOMES_PT.includes(base)) comNomePt.push(`${pasta}/${arquivo}`);
    }
}
check('nenhum arquivo de comando ou action com nome em português', comNomePt.length === 0,
    comNomePt.length ? `(${comNomePt.join(', ')})` : '');

if (falhas > 0) {
    console.log(`\n*** ${falhas} FALHA(S) ***`);
    process.exitCode = 1;
} else {
    console.log('\n*** TODOS OS TESTES DE REQUIRE PASSARAM ***');
}
