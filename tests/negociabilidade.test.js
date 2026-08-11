/**
 * Testes das cartas de evento e da negociabilidade.
 *
 * ## O que precisa valer sempre
 *
 * - **Carta de evento nunca sai de sorteio.** Nem de `/roll`, nem de
 *   caixa. É a única coisa que a torna exclusiva — se vazar para o
 *   sorteio, a carta da beta deixa de significar "eu estava lá".
 * - **Carta vinculada não troca de mãos por nenhum caminho.** São seis:
 *   mercado, venda rápida, troca, transferência, desmanche e painel.
 *   Esquecer um faria a regra virar decoração, e o caminho esquecido não
 *   daria erro — ele simplesmente funcionaria.
 * - **A negociabilidade fica congelada na cópia.** Marcar uma carta como
 *   vinculada depois não pode tirar de ninguém o direito de vender algo
 *   que ganhou sob outra regra.
 * - Ausência do campo significa NEGOCIÁVEL: é o caso de todo o acervo
 *   anterior a esta mudança.
 */

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const ROOT = path.join(RAIZ, 'Commands', 'utils') + path.sep;

const negociabilidade = require(ROOT + 'tradability.js');
const sorteio = require(ROOT + 'draw.js');
const caixas = require(ROOT + 'boxes.js');
const valores = require(ROOT + 'cardValues.js');
const ui = require(ROOT + 'embeds.js');
const aprimoramento = require(ROOT + 'upgrading.js');
const itens = require(ROOT + 'items.js');

let falhas = 0;
const check = (nome, cond, extra = '') => {
    console.log(`  ${cond ? 'OK  ' : 'FALHOU'} ${nome} ${extra}`);
    if (!cond) falhas++;
};

const evento = (extra = {}) => ({ rarity: 'event', name: 'Carta da Beta', ...extra });
const normal = (extra = {}) => ({ rarity: 'legendary', name: 'Carta normal', ...extra });

console.log('=== CARTA DE EVENTO NUNCA SAI DE SORTEIO ===');
check('não está na tabela de chances do /roll',
    !sorteio.tabelaDeChances().some((f) => f.raridade === 'event'));

check('nem com CHANCE_MESTRA absurda',
    !sorteio.tabelaDeChances(99).some((f) => f.raridade === 'event'));

// 50 mil sorteios: se houvesse qualquer caminho, apareceria.
const saiu = new Set();
for (let i = 0; i < 50000; i++) saiu.add(sorteio.sortearRaridade().raridade);
check('50.000 sorteios nunca devolvem evento', !saiu.has('event'),
    `(saíram: ${[...saiu].join(', ')})`);

check('nenhuma caixa tem evento na distribuição',
    caixas.todas().every((c) => c.distribuicao.event === undefined),
    '<- nem a Lendária');

const deCaixa = new Set();
for (const caixa of caixas.todas()) {
    for (let i = 0; i < 5000; i++) deCaixa.add(caixas.sortearRaridade(caixa));
}
check('25.000 aberturas de caixa nunca devolvem evento', !deCaixa.has('event'));

// A proteção contra azar também não pode entregar uma.
check('nenhuma rede de proteção garante evento',
    sorteio.PROTECOES.every((p) => p.raridade !== 'event'));

console.log('\n=== A raridade existe em todas as tabelas ===');
// Faltar numa delas dá erro só quando a primeira carta de evento for
// criada — meses depois, e longe da causa.
check('embeds tem rótulo e emoji', ui.getRarity('event').label === 'Evento');
check('valores tem preço', valores.valorDeMercado('event', 70) > 0);
check('valores tem venda rápida', valores.valorDeVenda('event', 70) > 0);
check('aprimoramento tem chance base', aprimoramento.chances('event', 0).sucesso > 0);
check('aprimoramento tem custo', aprimoramento.custoEmGemas('event', 0) > 0);
check('desmanche tem tabela', itens.gemasDoDesmanche('event') > 0);
check('sorteio conhece a ordem', sorteio.posicao('event') >= 0);

console.log('\n=== Evento é a mais valiosa e a que pior vende ao bot ===');
check('vale mais que a Mestra',
    valores.valorDeMercado('event', 70) > valores.valorDeMercado('master', 70),
    `(${valores.valorDeMercado('event', 70)} vs ${valores.valorDeMercado('master', 70)})`);

const pctEvento = valores.valorDeVenda('event', 70) / valores.valorDeMercado('event', 70);
const pctMestra = valores.valorDeVenda('master', 70) / valores.valorDeMercado('master', 70);
check('a venda rápida paga um % menor que na Mestra', pctEvento < pctMestra,
    `(${(pctEvento * 100).toFixed(0)}% vs ${(pctMestra * 100).toFixed(0)}%)`);

check('fica acima de tudo na ordenação',
    ui.compareRarityDesc('event', 'master') < 0,
    '<- aparece antes no inventário');

console.log('\n=== Negociabilidade ===');
check('carta sem o campo é negociável', negociabilidade.podeNegociar(normal()));
check('comercializavel true é negociável',
    negociabilidade.podeNegociar(normal({ comercializavel: true })));
check('comercializavel false NÃO é',
    !negociabilidade.podeNegociar(normal({ comercializavel: false })));
check('carta nula não quebra', negociabilidade.podeNegociar(null) === true);

console.log('\n=== Desmanche ===');
check('carta normal desmancha', negociabilidade.podeDesmanchar(normal()));
check('carta vinculada NÃO desmancha',
    !negociabilidade.podeDesmanchar(normal({ comercializavel: false })));
// Mesmo negociável: ela não volta a ser distribuída, e desmanchar é o
// único clique do jogo que apaga algo insubstituível.
check('carta de EVENTO nunca desmancha, mesmo negociável',
    !negociabilidade.podeDesmanchar(evento({ comercializavel: true })),
    '<- é irreversível e ela não volta');
check('mas evento negociável PODE ser vendida',
    negociabilidade.podeNegociar(evento({ comercializavel: true })));

console.log('\n=== As mensagens explicam ===');
check('vinculada tem motivo',
    typeof negociabilidade.motivoDeRecusa(normal({ comercializavel: false })) === 'string');
check('evento no desmanche tem motivo próprio',
    negociabilidade.motivoDeRecusa(evento(), 'desmanchar')?.includes('evento'));
check('carta normal não tem motivo de recusa',
    negociabilidade.motivoDeRecusa(normal()) === null);

console.log('\n=== Selo visual ===');
check('vinculada tem selo', negociabilidade.selo(normal({ comercializavel: false })) === '🔒');
check('negociável não tem', negociabilidade.selo(normal()) === '');

// ---------------------------------------------------------------------
console.log('\n=== TODO CAMINHO DE VENDA CONSULTA A REGRA ===');
//
// A regra vale em seis lugares. Se um deles parar de consultar o módulo,
// a carta vinculada passa a ser negociável por ali — e sem erro nenhum,
// porque o caminho simplesmente funciona.
//
// Esta varredura é a única coisa que impede isso de acontecer em silêncio
// daqui a seis meses, quando alguém mexer num desses arquivos.

const CAMINHOS_DE_SAIDA = [
    'Commands/actions/run/sellRun.js',
    'Commands/actions/run/tradeRun.js',
    'Commands/commands/quicksellSlashCommand.js',
    'Commands/commands/salvageSlashCommand.js'
];

const semGuarda = CAMINHOS_DE_SAIDA.filter((arquivo) => {
    const completo = path.join(RAIZ, arquivo);
    if (!fs.existsSync(completo)) return true;
    return !fs.readFileSync(completo, 'utf8').includes('negociabilidade');
});

check('mercado, troca, venda rápida e desmanche consultam a regra',
    semGuarda.length === 0,
    semGuarda.length ? `\n     sem guarda: ${semGuarda.join(', ')}` : '');

console.log('\n=== O SORTEIO EXCLUI CARTA FORA DE ROTAÇÃO ===');
// `distribuivel: false` é a segunda trava. Sem ela no $match, uma carta
// recolhida voltaria a sair sem ninguém perceber.
const SORTEIOS = [
    'Commands/actions/run/rollRun.js',
    'Commands/actions/run/boxRun.js'
];

const semFiltro = SORTEIOS.filter((arquivo) => {
    const src = fs.readFileSync(path.join(RAIZ, arquivo), 'utf8');
    return !src.includes('distribuivel');
});

check('roll e caixa filtram por distribuivel', semFiltro.length === 0,
    semFiltro.length ? `\n     sem filtro: ${semFiltro.join(', ')}` : '');

console.log('\n=== A CÓPIA CONGELA A NEGOCIABILIDADE ===');
// Sem isto, marcar uma carta como vinculada no catálogo tiraria de quem
// já a tinha o direito de vendê-la.
const ENTREGAS = [
    'Commands/actions/collect/rollCollect.js',
    'Commands/actions/run/boxRun.js'
];

const semCopia = ENTREGAS.filter((arquivo) => {
    const src = fs.readFileSync(path.join(RAIZ, arquivo), 'utf8');
    return !src.includes('comercializavel');
});

check('as entregas copiam o campo', semCopia.length === 0,
    semCopia.length ? `\n     sem cópia: ${semCopia.join(', ')}` : '');

console.log(falhas === 0 ? '\n*** TODOS OS TESTES DE EVENTO PASSARAM ***' : `\n*** ${falhas} FALHA(S) ***`);
process.exit(falhas ? 1 : 0);
