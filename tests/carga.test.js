/**
 * Carrega de verdade todo módulo e monta o JSON de todo slash command.
 *
 * ## O que este teste pega que o `requires.test.js` não pega
 *
 * Aquele prova que o CAMINHO existe. Este prova que o módulo CARREGA e
 * exporta o que quem o importa espera. São coisas diferentes: quando um
 * módulo passa a exportar outro nome, a desestruturação do lado de quem
 * importa não falha — ela devolve `undefined`, e o erro só aparece quando
 * a função é chamada. Em produção, no primeiro jogador que usar o
 * comando.
 *
 * ## O canvas é substituído por um dublê
 *
 * O binário nativo do `canvas` não compila em toda máquina (ele é
 * compilado contra uma versão específica do Node), e sem o dublê metade
 * dos comandos não carregaria aqui — que é justamente a metade que mais
 * precisa ser conferida. O dublê não afeta a resolução de módulo nenhum;
 * ele só desenha a imagem da carta.
 *
 * Onde o canvas compila, o dublê simplesmente não muda nada.
 */

const path = require('path');
const fs = require('fs');
const Module = require('module');

const RAIZ = path.join(__dirname, '..');

// --- dublê do canvas, antes de qualquer require do projeto ---
const resolverOriginal = Module._resolveFilename;
Module._resolveFilename = function (pedido, ...resto) {
    if (pedido === 'canvas') return 'canvas-duble';
    return resolverOriginal.call(this, pedido, ...resto);
};
require.cache['canvas-duble'] = {
    id: 'canvas-duble',
    loaded: true,
    exports: {
        createCanvas: () => ({
            getContext: () => new Proxy({}, { get: () => () => {} }),
            toBuffer: () => Buffer.alloc(0)
        }),
        loadImage: async () => ({}),
        registerFont: () => {},
        Image: class {}
    }
};

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
        const p = path.join(dir, nome);
        if (fs.statSync(p).isDirectory()) varrer(p, saida);
        else if (nome.endsWith('.js')) saida.push(p);
    }
    return saida;
}

// ---------------------------------------------------------------------
console.log('\n=== Todo módulo carrega ===');

const alvos = ['Commands/utils', 'Commands/actions', 'Commands/handlers', 'Commands/commands']
    .flatMap((pasta) => varrer(path.join(RAIZ, pasta)));

const naoCarregaram = [];
for (const arquivo of alvos) {
    try {
        require(arquivo);
    } catch (e) {
        naoCarregaram.push(`${path.relative(RAIZ, arquivo)}: ${e.message.split('\n')[0]}`);
    }
}
check('nenhum módulo falha ao carregar', naoCarregaram.length === 0,
    naoCarregaram.length ? `\n       ${naoCarregaram.join('\n       ')}` : `(${alvos.length} módulos)`);

// ---------------------------------------------------------------------
console.log('\n=== Todo slash command monta o JSON ===');
//
// É o JSON que vai para a API do Discord. Se um só falhar, o registro
// inteiro falha e o bot sobe sem comando nenhum.

const arquivosDeComando = varrer(path.join(RAIZ, 'Commands/commands'));
const comandos = [];
const naoMontaram = [];

for (const arquivo of arquivosDeComando) {
    try {
        const Classe = require(arquivo);
        const json = new Classe().getSlashCommandJSON();
        if (!json.name) throw new Error('JSON sem `name`');
        comandos.push(json);
    } catch (e) {
        naoMontaram.push(`${path.basename(arquivo)}: ${e.message.split('\n')[0]}`);
    }
}
check('todo comando monta o JSON', naoMontaram.length === 0,
    naoMontaram.length ? `\n       ${naoMontaram.join('\n       ')}` : `(${comandos.length} comandos)`);

const nomes = comandos.map((c) => c.name);
const duplicados = [...new Set(nomes.filter((n, i) => nomes.indexOf(n) !== i))];
check('nenhum nome de comando duplicado', duplicados.length === 0,
    duplicados.length ? `(${duplicados.join(', ')})` : '');

// Descrição vazia, ou que virou a própria chave, quer dizer que o
// dicionário não resolveu — e o Discord recusa descrição vazia.
const descricoesRuins = [];
function conferirDescricao(caminho, obj) {
    if (!obj.description || obj.description.includes('comandos.')) {
        descricoesRuins.push(`${caminho} -> "${obj.description}"`);
    }
    for (const o of obj.options || []) conferirDescricao(`${caminho} ${o.name}`, o);
}
for (const json of comandos) conferirDescricao(`/${json.name}`, json);
check('toda descrição saiu do dicionário', descricoesRuins.length === 0,
    descricoesRuins.length ? `\n       ${descricoesRuins.join('\n       ')}` : '');

// ---------------------------------------------------------------------
console.log('\n=== Opção declarada e opção lida são as mesmas ===');
//
// Renomear `.setName('nome')` sem renomear `options.getString('nome')`
// faz a leitura devolver `null` para sempre: o comando não quebra, ele
// age como se o jogador não tivesse digitado nada. Aconteceu com o
// `/treino` ao padronizar os nomes — a chamada usava `getString?.()` e
// escapou da primeira varredura.

function opcoesDeclaradas(json) {
    const nomes = new Set();
    for (const o of json.options || []) {
        // 1 = subcomando, 2 = grupo de subcomandos
        if (o.type === 1 || o.type === 2) {
            for (const oo of o.options || []) nomes.add(oo.name);
        } else {
            nomes.add(o.name);
        }
    }
    return nomes;
}

const declaradas = new Set();
for (const json of comandos) {
    for (const n of opcoesDeclaradas(json)) declaradas.add(n);
}

const lidas = new Map();
for (const arquivo of varrer(path.join(RAIZ, 'Commands'))) {
    const codigo = fs.readFileSync(arquivo, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');

    // Cobre `options.getString(`, `options?.getString?.(` e variantes.
    for (const m of codigo.matchAll(/options\??\.get[A-Za-z]+\??\.?\(\s*['"]([a-z-]+)['"]/g)) {
        if (!lidas.has(m[1])) lidas.set(m[1], new Set());
        lidas.get(m[1]).add(path.relative(RAIZ, arquivo));
    }
}

const orfas = [...lidas.keys()]
    .filter((n) => !declaradas.has(n))
    .map((n) => `${n} <- ${[...lidas.get(n)].join(', ')}`);
check('toda opção lida é declarada por algum comando', orfas.length === 0,
    orfas.length ? `\n       ${orfas.join('\n       ')}` : `(${lidas.size} nomes lidos)`);

const ignoradas = [...declaradas].filter((n) => !lidas.has(n));
check('toda opção declarada é lida em algum lugar', ignoradas.length === 0,
    ignoradas.length ? `(${ignoradas.join(', ')}) <- o jogador digita e o valor é ignorado`
        : `(${declaradas.size} opções)`);

// ---------------------------------------------------------------------
console.log('\n=== Subcomando comparado no código existe ===');

const subsDeclarados = new Set();
for (const json of comandos) {
    for (const o of json.options || []) {
        if (o.type === 1) subsDeclarados.add(o.name);
    }
}

const subsComparados = new Set();
for (const arquivo of varrer(path.join(RAIZ, 'Commands'))) {
    const codigo = fs.readFileSync(arquivo, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of codigo.matchAll(/(?:sub|getSubcommand\((?:false)?\))\s*===\s*['"]([a-z-]+)['"]/g)) {
        subsComparados.add(m[1]);
    }
}

const subsOrfaos = [...subsComparados].filter((s) => !subsDeclarados.has(s));
check('toda comparação de subcomando pode casar', subsOrfaos.length === 0,
    subsOrfaos.length ? `(${subsOrfaos.join(', ')}) <- a comparação nunca é verdadeira`
        : `(${subsComparados.size} comparações, ${subsDeclarados.size} declarados)`);

if (falhas > 0) {
    console.log(`\n*** ${falhas} FALHA(S) ***`);
    process.exitCode = 1;
} else {
    console.log('\n*** TODOS OS TESTES DE CARGA PASSARAM ***');
}
