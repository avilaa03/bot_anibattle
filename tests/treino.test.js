/**
 * Testes do modo treino.
 *
 * O que precisa valer sempre:
 *
 * - O rival acompanha a força do SEU time. Um jogador começando não pode
 *   enfrentar cartas lendárias, senão o treino não ensina nada.
 * - A faixa de overall nunca sai invertida. Time muito fraco no modo
 *   fácil chegava perto de gerar `min > max`, o que faria a consulta não
 *   achar carta nenhuma e o comando falhar justamente para quem mais
 *   precisa dele.
 * - Catálogo pequeno não impede o treino.
 */

const path = require('path');
const ROOT = path.join(__dirname, '..', 'Commands', 'utils') + path.sep;

// --- duplo do catálogo ---
let catalogo = [];
const Card = {
    async aggregate(pipeline) {
        const match = pipeline.find((e) => e.$match)?.$match;
        const sample = pipeline.find((e) => e.$sample)?.$sample;

        let r = catalogo;
        if (match?.overall) {
            const { $gte, $lte } = match.overall;
            r = r.filter((c) => c.overall >= $gte && c.overall <= $lte);
        }
        return r.slice(0, sample?.size ?? r.length);
    }
};
require.cache[require.resolve(ROOT + 'cardSchema.js')] = { exports: Card };

const treino = require(ROOT + 'treino.js');

let falhas = 0;
const check = (nome, cond, extra = '') => {
    console.log(`  ${cond ? 'OK  ' : 'FALHOU'} ${nome} ${extra}`);
    if (!cond) falhas++;
};

const carta = (nome, ovr) => ({
    name: nome, series: 'S', rarity: 'common',
    overall: ovr, ATA: ovr, LIF: ovr * 2, POW: ovr
});

const encherCatalogo = (de, ate) => {
    catalogo = [];
    for (let o = de; o <= ate; o++) catalogo.push(carta(`Carta${o}`, o));
};

(async () => {
console.log('=== Nome do rival ===');
check('o rival se chama BOT Caviar', treino.NOME_RIVAL === 'BOT Caviar', `(${treino.NOME_RIVAL})`);

console.log('\n=== Média do time ===');
check('média de 3 cartas', treino.mediaOverall([carta('a', 60), carta('b', 70), carta('c', 80)]) === 70);
check('time vazio devolve zero', treino.mediaOverall([]) === 0);
check('nulo não quebra', treino.mediaOverall(null) === 0);

console.log('\n=== As 3 melhores ===');
const inventario = [carta('fraca', 30), carta('forte', 90), carta('media', 60), carta('ok', 70)];
const melhores = treino.melhoresTres(inventario);
check('pega 3', melhores.length === 3);
check('em ordem decrescente', melhores.map((c) => c.overall).join(',') === '90,70,60');
check('inventário menor que 3 não quebra', treino.melhoresTres([carta('x', 50)]).length === 1);

console.log('\n=== Dificuldade muda a faixa ===');
const facil = treino.faixaDeOverall(70, 'facil');
const parelho = treino.faixaDeOverall(70, 'parelho');
const dificil = treino.faixaDeOverall(70, 'dificil');

check('fácil mira abaixo do seu time', facil.alvo < 70, `(${facil.alvo})`);
check('parelho mira no seu nível', parelho.alvo === 70, `(${parelho.alvo})`);
check('difícil mira acima', dificil.alvo > 70, `(${dificil.alvo})`);
check('as três faixas são crescentes', facil.alvo < parelho.alvo && parelho.alvo < dificil.alvo);

console.log('\n=== A faixa nunca sai invertida ===');
// `max > min` estrito, não apenas `min <= max`.
//
// A primeira versão deste teste aceitava min === max, e por isso passava
// mesmo depois de eu remover a proteção do código de propósito. Faixa de
// largura zero (`$gte: 1, $lte: 1`) só acha carta com overall exatamente
// aquele — quase sempre nenhuma, e o treino cairia sempre no sorteio
// geral, ignorando a dificuldade em silêncio.
const ruins = [];
for (const media of [0, 0.4, 1, 2, 3, 5, 10, 50, 99, 200]) {
    for (const d of ['facil', 'parelho', 'dificil']) {
        const f = treino.faixaDeOverall(media, d);
        if (f.max <= f.min || f.min < 1 || !Number.isInteger(f.min) || !Number.isInteger(f.max)) {
            ruins.push(`media=${media} ${d} -> [${f.min}, ${f.max}]`);
        }
    }
}
check('a faixa sempre tem largura, mínimo 1 e valores inteiros', ruins.length === 0,
    ruins.length ? `\n       ${ruins.slice(0, 5).join('\n       ')}` : '<- inclusive com time muito fraco no modo fácil');

check('dificuldade inválida cai no padrão',
    treino.faixaDeOverall(70, 'inventada').alvo === treino.faixaDeOverall(70, treino.PADRAO).alvo);
check('sem dificuldade usa o padrão',
    treino.faixaDeOverall(70).alvo === treino.faixaDeOverall(70, treino.PADRAO).alvo);

console.log('\n=== Montagem do time rival ===');
encherCatalogo(20, 95);
const meu = [carta('a', 70), carta('b', 68), carta('c', 66)];

for (const d of ['facil', 'parelho', 'dificil']) {
    const r = await treino.montarTimeRival(meu, d);
    check(`${d}: montou 3 cartas`, r.ok && r.timeRival.length === 3);
    check(`${d}: o rival tem os atributos de combate`,
        r.timeRival.every((c) => Number.isFinite(c.ATA) && Number.isFinite(c.LIF) && Number.isFinite(c.POW)));
}

const rFacil = await treino.montarTimeRival(meu, 'facil');
const rDificil = await treino.montarTimeRival(meu, 'dificil');
check('o rival do fácil é mais fraco que o do difícil',
    treino.mediaOverall(rFacil.timeRival) < treino.mediaOverall(rDificil.timeRival),
    `(${treino.mediaOverall(rFacil.timeRival).toFixed(0)} vs ${treino.mediaOverall(rDificil.timeRival).toFixed(0)})`);

console.log('\n=== O rival acompanha a coleção do jogador ===');
const iniciante = [carta('a', 30), carta('b', 28), carta('c', 25)];
const veterano = [carta('a', 95), carta('b', 93), carta('c', 90)];

const rIniciante = await treino.montarTimeRival(iniciante, 'parelho');
const rVeterano = await treino.montarTimeRival(veterano, 'parelho');

check('iniciante enfrenta cartas fracas',
    treino.mediaOverall(rIniciante.timeRival) < 50,
    `(${treino.mediaOverall(rIniciante.timeRival).toFixed(0)})`);
check('veterano enfrenta cartas fortes',
    treino.mediaOverall(rVeterano.timeRival) > 70,
    `(${treino.mediaOverall(rVeterano.timeRival).toFixed(0)})`);

console.log('\n=== Catálogo pequeno ou fora da faixa ===');
catalogo = [carta('unica', 50)];
const rUma = await treino.montarTimeRival(meu, 'dificil');
check('1 carta no catálogo ainda monta um time de 3', rUma.ok && rUma.timeRival.length === 3,
    '<- quem está começando é quem mais usa o treino');

catalogo = [carta('a', 10), carta('b', 12)];
const rForaDaFaixa = await treino.montarTimeRival(veterano, 'dificil');
check('faixa vazia cai para o catálogo inteiro', rForaDaFaixa.ok && rForaDaFaixa.timeRival.length === 3);

catalogo = [];
const rVazio = await treino.montarTimeRival(meu, 'parelho');
check('catálogo vazio devolve erro tratado', rVazio.ok === false && rVazio.motivo === 'CATALOGO_VAZIO');

console.log('\n=== A luta de treino funciona de ponta a ponta ===');
encherCatalogo(20, 95);
const { runBattle } = require(ROOT + 'battleEngine.js');
const montagem = await treino.montarTimeRival(meu, 'parelho');
const luta = runBattle(montagem.meuTime, montagem.timeRival);

check('sai um resultado', ['X', 'Y', null].includes(luta.winner));
check('3 rounds', luta.rounds.length === 3);
check('a soma dos rounds bate', luta.winsX + luta.winsY === 3);
check('gera eventos para a transmissão', luta.rounds.every((r) => r.eventos.length > 0));

console.log(falhas === 0 ? '\n*** TODOS OS TESTES DE TREINO PASSARAM ***' : `\n*** ${falhas} FALHA(S) ***`);
process.exit(falhas ? 1 : 0);
})();
