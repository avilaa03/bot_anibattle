/**
 * Testes da varredura de torneios travados.
 *
 * O caso que motivou este arquivo: um torneio em `emandamento` nunca era
 * varrido. A execução leva segundos, então essa fase só persiste se o bot
 * cair no meio — e quando isso acontecia, o servidor ficava travado para
 * sempre, porque `ativoNoServidor` considera a fase ocupada e nada nunca
 * a tirava dela. Não havia nem botão para cancelar, já que a mensagem de
 * inscrição tinha sido substituída pela execução.
 */

const path = require('path');
const ROOT = path.join(__dirname, '..', 'Commands', 'utils') + path.sep;

// --- duplos em memória ---
let docs = [];
const devolucoes = [];

function casaFiltro(doc, filtro) {
    if (filtro.$or) return filtro.$or.some((f) => casaFiltro(doc, f));
    for (const [chave, valor] of Object.entries(filtro)) {
        const atual = doc[chave];
        if (valor && typeof valor === 'object' && !(valor instanceof Date)) {
            if ('$in' in valor && !valor.$in.includes(atual)) return false;
            if ('$lt' in valor && !(new Date(atual) < valor.$lt)) return false;
            if ('$ne' in valor && atual === valor.$ne) return false;
        } else if (atual !== valor) return false;
    }
    return true;
}

const Tournament = {
    find(filtro) {
        const achados = docs.filter((d) => casaFiltro(d, filtro));
        // O código faz `await Tournament.find(...)` direto, sem .lean().
        return Promise.resolve(achados);
    },
    findOne(filtro) {
        return Promise.resolve(docs.find((d) => casaFiltro(d, filtro)) || null);
    },
    findOneAndUpdate(filtro, update) {
        const d = docs.find((x) => casaFiltro(x, filtro));
        if (!d) return Promise.resolve(null);
        Object.assign(d, update);
        return Promise.resolve(d);
    }
};

require.cache[require.resolve(ROOT + 'tournamentSchema.js')] = { exports: Tournament };
require.cache[require.resolve(ROOT + 'userSchema.js')] = { exports: {} };
require.cache[require.resolve(ROOT + 'battleEngine.js')] = { exports: { runBattle: () => ({}) } };
require.cache[require.resolve(ROOT + 'economy.js')] = {
    exports: {
        trySpend: async () => true,
        addBalance: async (id, valor) => { devolucoes.push({ id, valor }); }
    }
};

const torneio = require(ROOT + 'tournament.js');

let falhas = 0;
const check = (nome, cond, extra = '') => {
    console.log(`  ${cond ? 'OK  ' : 'FALHOU'} ${nome} ${extra}`);
    if (!cond) falhas++;
};

const MIN = 60 * 1000;
const criar = (props) => ({
    tournamentId: props.id,
    guildId: props.guild || 'g1',
    fase: props.fase,
    criadoEm: new Date(Date.now() - (props.idadeMin || 0) * MIN),
    taxaInscricao: props.taxa || 0,
    participantes: props.participantes || [],
    vagas: 8,
    save: async function () { return this; }
});

(async () => {
console.log('=== Varredura de torneios travados ===');
devolucoes.length = 0;
docs = [
    criar({ id: 'novo', fase: 'inscricoes', idadeMin: 5 }),
    criar({ id: 'velho', fase: 'inscricoes', idadeMin: 90 }),
    criar({ id: 'executando', fase: 'emandamento', idadeMin: 1 }),
    criar({ id: 'travado', fase: 'emandamento', idadeMin: 30 }),
    criar({ id: 'pronto', fase: 'concluido', idadeMin: 500 }),
    criar({ id: 'jaCancelado', fase: 'cancelado', idadeMin: 500 })
];

const quantos = await torneio.limparAbandonados();
const faseDe = (id) => docs.find((d) => d.tournamentId === id).fase;

check('cancelou 2 (inscrição velha + execução travada)', quantos === 2, `(${quantos})`);
check('inscrição recente continua aberta', faseDe('novo') === 'inscricoes');
check('inscrição de 90 min foi cancelada', faseDe('velho') === 'cancelado');
check('execução de 1 min NÃO é interrompida', faseDe('executando') === 'emandamento');
check('execução travada há 30 min foi cancelada', faseDe('travado') === 'cancelado',
    '<- este era o bug: o servidor ficava travado para sempre');
check('torneio concluído não é mexido', faseDe('pronto') === 'concluido');

console.log('\n=== Devolução das inscrições ===');
devolucoes.length = 0;
docs = [criar({
    id: 'comTaxa', fase: 'inscricoes', idadeMin: 90, taxa: 50,
    participantes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
})];

await torneio.limparAbandonados();
check('devolveu para os 3 inscritos', devolucoes.length === 3, `(${devolucoes.length})`);
check('devolveu o valor certo', devolucoes.every((d) => d.valor === 50));

console.log('\n=== Torneio de graça não gera devolução ===');
devolucoes.length = 0;
docs = [criar({
    id: 'semTaxa', fase: 'inscricoes', idadeMin: 90, taxa: 0,
    participantes: [{ id: 'a' }, { id: 'b' }]
})];
await torneio.limparAbandonados();
check('nenhuma moeda foi criada do nada', devolucoes.length === 0, `(${devolucoes.length})`);

console.log('\n=== Servidor destravado depois da varredura ===');
docs = [criar({ id: 'travado2', fase: 'emandamento', guild: 'g9', idadeMin: 30 })];
check('antes: servidor ocupado', (await torneio.ativoNoServidor('g9')) !== null);
await torneio.limparAbandonados();
check('depois: servidor livre para criar torneio novo', (await torneio.ativoNoServidor('g9')) === null);

console.log('\n=== Prazos ===');
check('inscrição expira em 1 hora', torneio.TTL_MS === 60 * 60 * 1000);
check('execução travada expira em 5 min', torneio.TTL_EXECUCAO_MS === 5 * 60 * 1000);
check('execução expira MUITO antes da inscrição', torneio.TTL_EXECUCAO_MS < torneio.TTL_MS);

console.log(falhas === 0 ? '\n*** TODOS OS TESTES DE TORNEIO PASSARAM ***' : `\n*** ${falhas} FALHA(S) ***`);
process.exit(falhas ? 1 : 0);
})();
