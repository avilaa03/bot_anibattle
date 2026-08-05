/**
 * Testes do limite diário.
 *
 * É a trava que impede a caixa de virar torneira. Sem ela, o valor
 * esperado negativo não basta: quem tem muito dinheiro converteria saldo
 * em cartas em escala, e a economia deixaria de depender de tempo.
 *
 * O que precisa valer sempre:
 *
 * - **A decisão é do banco, no filtro do update.** Ler o contador, comparar
 *   no Node e escrever deixa uma janela entre a leitura e a gravação: dois
 *   cliques rápidos leem "0 de 1" e os dois compram.
 * - O contador zera quando o dia vira, e contador de ontem vale zero mesmo
 *   antes do rollover rodar.
 * - `limite: null` significa sem limite, não "limite zero".
 */

const path = require('path');
const ROOT = path.join(__dirname, '..', 'Commands', 'utils') + path.sep;

/**
 * Duplo do Mongo, com a semântica que importa: o filtro decide.
 *
 * Guardamos os documentos e aplicamos filtro e update na mão — é a única
 * forma de testar a trava sem subir um banco, e o comportamento que
 * interessa (`$lt` no filtro recusando a escrita) cabe em poucas linhas.
 */
const banco = new Map();

function pegar(id) {
    if (!banco.has(id)) banco.set(id, { id, limites: {} });
    return banco.get(id);
}

/** Lê 'limites.caixa.usos.lendaria' de um documento. */
function ler(doc, caminho) {
    return caminho.split('.').reduce((o, p) => (o === undefined || o === null ? undefined : o[p]), doc);
}

function escrever(doc, caminho, valor) {
    const partes = caminho.split('.');
    const ultima = partes.pop();
    const alvo = partes.reduce((o, p) => {
        if (typeof o[p] !== 'object' || o[p] === null) o[p] = {};
        return o[p];
    }, doc);
    alvo[ultima] = valor;
}

function casa(doc, filtro) {
    for (const [chave, cond] of Object.entries(filtro)) {
        if (chave === 'id') {
            if (doc.id !== cond) return false;
            continue;
        }
        if (chave === '$or') {
            if (!cond.some((sub) => casa(doc, sub))) return false;
            continue;
        }
        const valor = ler(doc, chave);
        if (cond && typeof cond === 'object') {
            if ('$ne' in cond && valor === cond.$ne) return false;
            if ('$lt' in cond && !(Number(valor) < cond.$lt)) return false;
            if ('$gt' in cond && !(Number(valor) > cond.$gt)) return false;
            if ('$exists' in cond && (valor !== undefined) !== cond.$exists) return false;
        } else if (valor !== cond) {
            return false;
        }
    }
    return true;
}

function aplicar(doc, update) {
    for (const [caminho, valor] of Object.entries(update.$set || {})) escrever(doc, caminho, valor);
    for (const [caminho, delta] of Object.entries(update.$inc || {})) {
        escrever(doc, caminho, (Number(ler(doc, caminho)) || 0) + delta);
    }
}

const User = {
    async updateOne(filtro, update, opcoes = {}) {
        const doc = opcoes.upsert ? pegar(filtro.id) : banco.get(filtro.id);
        if (!doc || !casa(doc, filtro)) return { matchedCount: 0 };
        aplicar(doc, update);
        return { matchedCount: 1 };
    },
    async findOneAndUpdate(filtro, update, opcoes = {}) {
        const doc = opcoes.upsert ? pegar(filtro.id) : banco.get(filtro.id);
        if (!doc || !casa(doc, filtro)) return null;
        aplicar(doc, update);
        return doc;
    }
};
require.cache[require.resolve(ROOT + 'userSchema.js')] = { exports: User };

const limite = require(ROOT + 'limiteDiario.js');

let falhas = 0;
const check = (nome, cond, extra = '') => {
    console.log(`  ${cond ? 'OK  ' : 'FALHOU'} ${nome} ${extra}`);
    if (!cond) falhas++;
};

const limpar = () => banco.clear();

(async () => {
console.log('=== O limite é respeitado ===');
limpar();
const r1 = await limite.consumir('u1', 'caixa', 'lendaria', 1);
const r2 = await limite.consumir('u1', 'caixa', 'lendaria', 1);
check('a primeira compra passa', r1.ok === true);
check('a segunda é recusada', r2.ok === false);
check('e informa o limite', r2.limite === 1);

console.log('\n=== Limites maiores contam certo ===');
limpar();
const tentativas = [];
for (let i = 0; i < 7; i++) {
    tentativas.push((await limite.consumir('u2', 'caixa', 'comum', 5)).ok);
}
check('exatamente 5 passam', tentativas.filter(Boolean).length === 5,
    `(${tentativas.filter(Boolean).length})`);
check('e as 2 últimas falham', tentativas.slice(5).every((t) => t === false));

console.log('\n=== Cada caixa tem contador próprio ===');
// Estourar o limite da Lendária não pode bloquear a Comum.
limpar();
await limite.consumir('u3', 'caixa', 'lendaria', 1);
const outra = await limite.consumir('u3', 'caixa', 'comum', 5);
check('a Comum passa mesmo com a Lendária esgotada', outra.ok === true);

console.log('\n=== Grupos são independentes ===');
limpar();
await limite.consumir('u4', 'caixa', 'lendaria', 1);
const rollExtra = await limite.consumir('u4', 'rollExtra', 'padrao', 2);
check('rollExtra não é afetado pelo grupo caixa', rollExtra.ok === true);

console.log('\n=== Sem limite é sem limite ===');
// `null` precisa significar "à vontade", não "zero".
limpar();
const semLimite = [];
for (let i = 0; i < 50; i++) {
    semLimite.push((await limite.consumir('u5', 'caixa', 'apoiador', null)).ok);
}
check('null libera sempre', semLimite.every(Boolean));
check('undefined também', (await limite.consumir('u5', 'caixa', 'apoiador', undefined)).ok === true);

console.log('\n=== O contador zera quando o dia vira ===');
limpar();
await limite.consumir('u6', 'caixa', 'lendaria', 1);
check('esgotou hoje', (await limite.consumir('u6', 'caixa', 'lendaria', 1)).ok === false);

// Simula a virada mexendo no dia gravado.
banco.get('u6').limites.caixa.dia = '2000-01-01';
check('no dia seguinte volta a poder',
    (await limite.consumir('u6', 'caixa', 'lendaria', 1)).ok === true);

console.log('\n=== Contador de ontem vale zero na leitura ===');
// Mesmo antes do rollover rodar: senão a tela mostraria "0 restantes"
// para quem já virou o dia.
limpar();
await limite.consumir('u7', 'caixa', 'comum', 5);
check('hoje conta', limite.lerUso(banco.get('u7'), 'caixa', 'comum') === 1);

banco.get('u7').limites.caixa.dia = '2000-01-01';
check('ontem não conta', limite.lerUso(banco.get('u7'), 'caixa', 'comum') === 0);
check('e o restante volta cheio',
    limite.restante(banco.get('u7'), 'caixa', 'comum', 5) === 5);

console.log('\n=== Devolução ===');
// Quando a entrega falha depois do consumo, a unidade tem que voltar.
limpar();
await limite.consumir('u8', 'caixa', 'lendaria', 1);
check('esgotado', (await limite.consumir('u8', 'caixa', 'lendaria', 1)).ok === false);
await limite.devolver('u8', 'caixa', 'lendaria');
check('depois de devolver, passa de novo',
    (await limite.consumir('u8', 'caixa', 'lendaria', 1)).ok === true);

console.log('\n=== Devolver não cria crédito ===');
// Devolver mais do que foi usado deixaria o contador negativo, e o
// jogador com compras de graça.
limpar();
await limite.devolver('u9', 'caixa', 'lendaria');
await limite.devolver('u9', 'caixa', 'lendaria');
const apos = await limite.consumir('u9', 'caixa', 'lendaria', 1);
check('ainda só uma compra', apos.ok === true);
check('e a segunda continua recusada',
    (await limite.consumir('u9', 'caixa', 'lendaria', 1)).ok === false);

console.log('\n=== Leituras de usuário sem dados ===');
check('usuário sem limites lê zero', limite.lerUso({}, 'caixa', 'lendaria') === 0);
check('usuário nulo não quebra', limite.lerUso(null, 'caixa', 'lendaria') === 0);
check('restante sem limite devolve null', limite.restante({}, 'caixa', 'x', null) === null);

console.log('\n=== A chave do dia é estável ===');
check('formato AAAA-MM-DD', /^\d{4}-\d{2}-\d{2}$/.test(limite.chaveDoDia()));
check('mesma data dá mesma chave',
    limite.chaveDoDia(new Date('2026-03-15T23:59:00Z')) === '2026-03-15');
check('vira à meia-noite UTC',
    limite.chaveDoDia(new Date('2026-03-16T00:00:00Z')) === '2026-03-16');

console.log(falhas === 0 ? '\n*** TODOS OS TESTES DE LIMITE PASSARAM ***' : `\n*** ${falhas} FALHA(S) ***`);
process.exit(falhas ? 1 : 0);
})();
