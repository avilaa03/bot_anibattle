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
 * - O JOGADOR escolhe o time dele, carta por carta e na ordem que quiser.
 *   O treino existe para prever a batalha real; se ele escalasse sozinho
 *   as 3 melhores, a parte que mais decide duelo — a ordem — nunca seria
 *   exercitada.
 * - A tela final é a mesma do `/battle`. Se as duas divergirem, o treino
 *   deixa de prever a batalha de verdade.
 */

const path = require('path');
const ROOT = path.join(__dirname, '..', 'Commands', 'utils') + path.sep;
const CMD = path.join(__dirname, '..', 'Commands') + path.sep;

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

const treino = require(ROOT + 'training.js');

let falhas = 0;
const check = (nome, cond, extra = '') => {
    console.log(`  ${cond ? 'OK  ' : 'FALHOU'} ${nome} ${extra}`);
    if (!cond) falhas++;
};

let proximoId = 0;
const carta = (nome, ovr) => ({
    _id: `id${++proximoId}`,
    name: nome, series: 'S', rarity: 'common',
    overall: ovr, ATA: ovr, LIF: ovr * 2, POW: ovr
});

const encherCatalogo = (de, ate) => {
    catalogo = [];
    for (let o = de; o <= ate; o++) catalogo.push(carta(`Carta${o}`, o));
};

/** Todos os botões de um resultado do montarEscolhaDeTime. */
const todosBotoes = (componentes) =>
    componentes.flatMap((linha) => linha.components.map((b) => b.data));

(async () => {
console.log('=== Nome do rival ===');
check('o rival se chama BOT Caviar', treino.NOME_RIVAL === 'BOT Caviar', `(${treino.NOME_RIVAL})`);

console.log('\n=== Média do time ===');
check('média de 3 cartas', treino.mediaOverall([carta('a', 60), carta('b', 70), carta('c', 80)]) === 70);
check('time vazio devolve zero', treino.mediaOverall([]) === 0);
check('nulo não quebra', treino.mediaOverall(null) === 0);

console.log('\n=== As 3 melhores (só para calibrar o rival) ===');
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

// -------------------------------------------------------------------
console.log('\n=== A sessão de escolha de time ===');
//
// A sessão vive em memória, nunca no Mongo: o treino não tem aposta a
// devolver, então uma queda do bot não deixa nada preso — e não guardar
// nada é o que torna impossível o treino sujar o banco.
encherCatalogo(20, 95);
const montagem = await treino.montarTimeRival(meu, 'parelho');

const inv = [carta('alfa', 80), carta('beta', 75), carta('gama', 70), carta('delta', 65)];
const abrir = () => treino.criarSessao({
    userId: 'u1',
    username: 'Jogador',
    inventario: inv,
    timeRival: montagem.timeRival,
    dificuldade: montagem.dificuldade,
    canalId: 'c1'
});

let sessao = abrir();
check('a sessão nasce com o time vazio', sessao.deck.length === 0 && sessao.selectedIds.length === 0);
check('o id não tem "_"', !sessao.id.includes('_'), `(${sessao.id})`);
check('dá para achar pelo id', treino.getSessao(sessao.id)?.id === sessao.id);
check('dá para achar pelo dono', treino.getSessaoDoUsuario('u1')?.id === sessao.id);
check('outro jogador não acha', treino.getSessaoDoUsuario('u2') === null);

console.log('\n=== O jogador escolhe as cartas, na ordem dele ===');
// A ordem é o que decide os confrontos: 1ª contra 1ª, 2ª contra 2ª. Se o
// treino reordenasse por overall, ele deixaria de testar exatamente a
// decisão que mais pesa numa batalha real.
const e1 = treino.escolherCarta(sessao.id, inv[3]); // delta, a PIOR
const e2 = treino.escolherCarta(sessao.id, inv[0]); // alfa
const e3 = treino.escolherCarta(sessao.id, inv[2]); // gama

check('as três entram', e1.ok && e2.ok && e3.ok);
check('a ordem escolhida é preservada',
    sessao.deck.map((c) => c.name).join(',') === 'delta,alfa,gama',
    `(${sessao.deck.map((c) => c.name).join(',')})`);
check('a terceira fecha o time', e3.completo === true);
check('as duas primeiras não fecham', e1.completo === false && e2.completo === false);

console.log('\n=== O que a sessão recusa ===');
check('quarta carta', treino.escolherCarta(sessao.id, inv[1]).motivo === 'TIME_CHEIO');
check('sessão inexistente', treino.escolherCarta('naoexiste', inv[1]).motivo === 'SESSAO_EXPIRADA');

// A repetida precisa ser testada com o time AINDA aberto: com 3 cartas
// dentro, a recusa viria por "time cheio" e a checagem de duplicata
// passaria batida mesmo se alguém a removesse.
const comEspaco = abrir();
treino.escolherCarta(comEspaco.id, inv[0]);
check('carta repetida', treino.escolherCarta(comEspaco.id, inv[0]).motivo === 'JA_ESCOLHIDA');
check('e o time não cresce com a recusa', comEspaco.deck.length === 1, `(${comEspaco.deck.length})`);
treino.encerrarSessao(comEspaco.id);

console.log('\n=== Só um clique resolve a luta ===');
// Sem esta trava, dois cliques na terceira carta chegando juntos
// resolveriam a batalha duas vezes e o canal receberia duas transmissões.
const primeira = treino.reservarParaResolver(sessao.id);
const segunda = treino.reservarParaResolver(sessao.id);
check('o primeiro reserva', primeira !== null);
check('o segundo não pega nada', segunda === null, '<- transmissão dupla');

treino.encerrarSessao(sessao.id);
check('encerrar some com a sessão', treino.getSessao(sessao.id) === null);
check('e o jogador fica livre para abrir outra', treino.getSessaoDoUsuario('u1') === null);

console.log('\n=== Time incompleto não resolve ===');
sessao = abrir();
treino.escolherCarta(sessao.id, inv[0]);
check('com 1 carta não dá para reservar', treino.reservarParaResolver(sessao.id) === null);
treino.encerrarSessao(sessao.id);

console.log('\n=== Sessão vencida some sozinha ===');
sessao = abrir();
sessao.criadaEm = Date.now() - treino.DURACAO_SESSAO_MS - 1;
check('getSessao devolve null', treino.getSessao(sessao.id) === null);
check('e não fica presa na memória', treino.getSessaoDoUsuario('u1') === null);

// -------------------------------------------------------------------
console.log('\n=== A tela de escolha do treino ===');
const treinoRun = require(CMD + 'actions/run/trainingRun.js');

sessao = abrir();
treino.escolherCarta(sessao.id, inv[1]);
const tela = treinoRun.telaDeEscolha(sessao);
const botoes = todosBotoes(tela.components);

const picks = botoes.filter((b) => String(b.custom_id).startsWith('treino_pick_'));
const cancelar = botoes.filter((b) => String(b.custom_id).startsWith('treino_cancel_'));

check('um botão por carta do inventário', picks.length === inv.length, `(${picks.length})`);
check('exatamente um botão de cancelar', cancelar.length === 1, `(${cancelar.length})`);
check('o cancelar carrega o id da sessão', cancelar[0].custom_id === `treino_cancel_${sessao.id}`);

// O roteador do index.js manda tudo que começa com "treino_" para o
// handler, e lá cada ação é lida pelo prefixo. Se um customId de carta
// não trouxer "pick_", ele cai como "recomeçar treino" e a dificuldade
// vira lixo, em silêncio.
check('todo customId de carta começa com treino_pick_',
    picks.every((b) => String(b.custom_id).startsWith('treino_pick_')));

const maiorId = Math.max(...botoes.map((b) => String(b.custom_id).length));
check('nenhum customId passa de 100 caracteres', maiorId <= 100, `(maior: ${maiorId})`);

const marcados = picks.filter((b) => b.disabled);
check('a carta já escolhida fica desativada', marcados.length === 1, `(${marcados.length})`);

const campos = tela.embed.data.fields || [];
check('o time do BOT aparece na tela',
    campos.some((f) => f.name.includes(treino.NOME_RIVAL)),
    '<- é contra ele que o jogador escala');
check('o time do jogador aparece conforme monta',
    campos.some((f) => f.name === 'Seu time' && /beta/i.test(f.value)));

treino.encerrarSessao(sessao.id);

// -------------------------------------------------------------------
console.log('\n=== A luta de treino funciona de ponta a ponta ===');
const { runBattle } = require(ROOT + 'battleEngine.js');

// O time é o que o JOGADOR escolheu, não as 3 melhores dele.
const meuTimeEscolhido = [inv[3], inv[0], inv[2]];
const luta = runBattle(meuTimeEscolhido, montagem.timeRival);

check('sai um resultado', ['X', 'Y'].includes(luta.winner), `(${luta.winner})`);
check('nunca dá empate', luta.winner !== null, '<- 3 confrontos sempre fecham 2-1 ou 3-0');
check('3 rounds', luta.rounds.length === 3);
check('a soma dos rounds bate', luta.winsX + luta.winsY === 3);
check('gera eventos para a transmissão', luta.rounds.every((r) => r.eventos.length > 0));
check('cada round usa a carta na posição que o jogador escolheu',
    luta.rounds.map((r) => r.cardX).join(',') === 'delta,alfa,gama',
    `(${luta.rounds.map((r) => r.cardX).join(',')})`);

console.log('\n=== A tela final é a mesma do /battle ===');
// Se o treino montasse a própria tela, as duas divergiriam na primeira
// mudança e o treino deixaria de mostrar o que a batalha real mostra.
const { montarEmbedResultado, contarDestaques } = require(ROOT + 'battleResult.js');
const { criarT } = require(ROOT + 'i18n.js');

const embedTreino = montarEmbedResultado({
    nomeX: 'Jogador', nomeY: treino.NOME_RIVAL, resultado: luta, t: criarT('pt-BR')
});
const dadosTreino = embedTreino.data;

check('tem título de fim de batalha', dadosTreino.title === '⚔️ Fim da batalha', `(${dadosTreino.title})`);
check('mostra o placar', /\d+\*\* — \*\*\d+/.test(dadosTreino.description), `(${dadosTreino.description})`);
check('tem o resumo das rodadas', (dadosTreino.fields || []).some((f) => f.name === 'Rodadas'));
check('cabe no limite do Discord',
    (dadosTreino.fields || []).every((f) => f.value.length <= 1024));

const embedEn = montarEmbedResultado({
    nomeX: 'Jogador', nomeY: treino.NOME_RIVAL, resultado: luta, t: criarT('en-US')
});
check('a tela final acompanha o idioma',
    embedEn.data.title === '⚔️ Battle over'
    && (embedEn.data.fields || []).some((f) => f.name === 'Rounds'),
    `(${embedEn.data.title})`);
check('o nome do rival NÃO se traduz',
    embedEn.data.description.includes(treino.NOME_RIVAL),
    '<- é nome próprio: traduzir faria os dois idiomas falarem de rivais diferentes');

const destaques = contarDestaques(luta);
check('conta críticos e viradas',
    Number.isInteger(destaques.criticos) && Number.isInteger(destaques.viradas),
    `(${destaques.criticos} crit, ${destaques.viradas} viradas)`);

console.log(falhas === 0 ? '\n*** TODOS OS TESTES DE TREINO PASSARAM ***' : `\n*** ${falhas} FALHA(S) ***`);
process.exit(falhas ? 1 : 0);
})();
