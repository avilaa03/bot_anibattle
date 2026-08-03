/**
 * Testes do banimento.
 *
 * Três coisas precisam valer sempre, e nenhuma delas é óbvia:
 *
 * 1. Banimento com prazo vencido libera sozinho. Sem isso, "suspenso por
 *    7 dias" viraria suspensão permanente na prática.
 * 2. Banco fora do ar NÃO pode banir todo mundo. Errar liberando é
 *    incômodo; errar bloqueando derruba o jogo inteiro numa queda do Mongo.
 * 3. O cache tem que funcionar, senão vira uma consulta a mais por clique
 *    — mas não pode ser eterno, senão desbanir não faz efeito.
 */

const path = require('path');
const { MessageFlags } = require('discord.js');
const ROOT = path.join(__dirname, '..', 'Commands', 'utils') + path.sep;

// --- duplo em memória do model User ---
let docs = [];
let consultas = 0;
let falharProximaConsulta = false;
const updates = [];

const User = {
    findOne(filtro) {
        consultas++;
        if (falharProximaConsulta) {
            return { select: () => ({ lean: async () => { throw new Error('banco fora do ar'); } }) };
        }
        const achado = docs.find((d) => d.id === filtro.id) || null;
        return { select: () => ({ lean: async () => achado }) };
    },
    async updateOne(filtro, update) {
        updates.push({ filtro, update });
        const d = docs.find((x) => x.id === filtro.id);
        if (d) {
            for (const [chave, valor] of Object.entries(update.$set || {})) {
                const partes = chave.split('.');
                let alvo = d;
                for (let i = 0; i < partes.length - 1; i++) alvo = alvo[partes[i]] ??= {};
                alvo[partes[partes.length - 1]] = valor;
            }
        }
        return { modifiedCount: d ? 1 : 0 };
    }
};

require.cache[require.resolve(ROOT + 'userSchema.js')] = { exports: User };

const moderacao = require(ROOT + 'moderacao.js');

let falhas = 0;
const check = (nome, cond, extra = '') => {
    console.log(`  ${cond ? 'OK  ' : 'FALHOU'} ${nome} ${extra}`);
    if (!cond) falhas++;
};

const DIA = 24 * 60 * 60 * 1000;

(async () => {
console.log('=== Quem pode jogar ===');
moderacao.limparCache();
docs = [
    { id: 'livre', banimento: { ativo: false } },
    { id: 'semCampo' },
    { id: 'permanente', banimento: { ativo: true, motivo: 'exploit', expiraEm: null } },
    { id: 'temporario', banimento: { ativo: true, motivo: 'flood', expiraEm: new Date(Date.now() + 3 * DIA) } },
    { id: 'vencido', banimento: { ativo: true, motivo: 'antigo', expiraEm: new Date(Date.now() - DIA) } }
];

check('conta limpa não é bloqueada', (await moderacao.consultarBanimento('livre')) === null);
check('conta sem o campo não quebra', (await moderacao.consultarBanimento('semCampo')) === null);
check('usuário inexistente não é bloqueado', (await moderacao.consultarBanimento('naoExiste')) === null);
check('id vazio não consulta o banco', (await moderacao.consultarBanimento(null)) === null);

const permanente = await moderacao.consultarBanimento('permanente');
check('banimento permanente bloqueia', permanente !== null);
check('devolve o motivo', permanente?.motivo === 'exploit', `(${permanente?.motivo})`);
check('permanente não tem prazo', permanente?.expiraEm === null);

const temporario = await moderacao.consultarBanimento('temporario');
check('banimento no prazo bloqueia', temporario !== null);
check('devolve a data de término', temporario?.expiraEm instanceof Date);

console.log('\n=== Prazo vencido libera sozinho ===');
updates.length = 0;
const vencido = await moderacao.consultarBanimento('vencido');
check('prazo vencido NÃO bloqueia', vencido === null);
check('e apaga o banimento no banco', updates.length === 1);
check('marcando ativo=false', updates[0]?.update?.$set?.['banimento.ativo'] === false);
check('o documento em memória refletiu', docs.find((d) => d.id === 'vencido').banimento.ativo === false);

console.log('\n=== Banco fora do ar não bane ninguém ===');
moderacao.limparCache();
falharProximaConsulta = true;
check('falha no banco deixa passar', (await moderacao.consultarBanimento('permanente')) === null);
falharProximaConsulta = false;

// A falha não pode ter sido memorizada: assim que o banco volta, o
// banimento precisa voltar a valer.
moderacao.limparCache();
check('quando o banco volta, o banimento volta', (await moderacao.consultarBanimento('permanente')) !== null);

console.log('\n=== Cache ===');
moderacao.limparCache();
consultas = 0;
await moderacao.consultarBanimento('livre');
await moderacao.consultarBanimento('livre');
await moderacao.consultarBanimento('livre');
check('3 chamadas = 1 consulta ao banco', consultas === 1, `(${consultas})`);

moderacao.limparCache('livre');
await moderacao.consultarBanimento('livre');
check('limpar o cache força nova consulta', consultas === 2, `(${consultas})`);

check('cache expira em 30s ou menos', moderacao.CACHE_MS <= 30000, `(${moderacao.CACHE_MS}ms)`);

console.log('\n=== Embed mostrado ao jogador ===');
const embedPermanente = moderacao.embedBanimento({ motivo: 'uso de exploit', expiraEm: null });
const jsonPermanente = JSON.stringify(embedPermanente.toJSON());
check('mostra o motivo ao jogador', jsonPermanente.includes('uso de exploit'));
check('diz que é permanente', /permanente/i.test(jsonPermanente));

const embedTemporario = moderacao.embedBanimento({ motivo: 'flood', expiraEm: new Date(Date.now() + DIA) });
check('banimento com prazo mostra data', /<t:\d+:/.test(JSON.stringify(embedTemporario.toJSON())));

console.log('\n=== Porteiro do interactionCreate ===');
moderacao.limparCache();
let respondeu = null;
const interacaoFalsa = (userId) => ({
    user: { id: userId },
    isRepliable: () => true,
    reply: async (dados) => { respondeu = dados; }
});

check('jogador livre passa', (await moderacao.bloquearSeBanido(interacaoFalsa('livre'))) === false);
check('e nada foi respondido a ele', respondeu === null);

check('jogador banido é bloqueado', (await moderacao.bloquearSeBanido(interacaoFalsa('permanente'))) === true);
check('e recebe o aviso', respondeu !== null);
// `flags` e não `ephemeral`: o campo antigo está depreciado e some no
// discord.js v15. Este teste falha se alguém voltar atrás.
check('o aviso é privado', respondeu?.flags === MessageFlags.Ephemeral,
    `(flags=${respondeu?.flags})`);
check('não usa o campo depreciado "ephemeral"', respondeu?.ephemeral === undefined);

console.log(falhas === 0 ? '\n*** TODOS OS TESTES DE MODERAÇÃO PASSARAM ***' : `\n*** ${falhas} FALHA(S) ***`);
process.exit(falhas ? 1 : 0);
})();
