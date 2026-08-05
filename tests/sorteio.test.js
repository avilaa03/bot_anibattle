/**
 * Testes da tabela de raridade e das proteções contra azar.
 *
 * A tabela morava solta dentro do `rollRun.js` e era a regra mais
 * delicada do jogo sem um único teste. O que precisa valer sempre:
 *
 * - A soma fecha em 100. Uma tabela somando 99,9 não quebra nada: só faz
 *   a Mestra nunca sair, e ninguém percebe por semanas.
 * - A escassez é monótona: cada raridade é mais rara que a anterior.
 * - A proteção NUNCA piora um roll. Se o sorteio deu Mestra, é Mestra que
 *   sai — mesmo no roll garantido.
 * - A MESTRA NUNCA É GARANTIDA. É a regra que o resto do jogo assume.
 * - Os contadores zeram pela carta ENTREGUE, não pela sorteada.
 */

const path = require('path');
const ROOT = path.join(__dirname, '..', 'Commands', 'utils') + path.sep;
const sorteio = require(ROOT + 'sorteio.js');

let falhas = 0;
const check = (nome, cond, extra = '') => {
    console.log(`  ${cond ? 'OK  ' : 'FALHOU'} ${nome} ${extra}`);
    if (!cond) falhas++;
};

/** Sorteio determinístico: devolve exatamente o percentil pedido. */
const fixo = (percentil) => () => percentil / 100;

const pct = (n) => `${n.toFixed(2)}%`;

// ---------------------------------------------------------------------
console.log('=== A tabela fecha em 100 ===');

const tabela = sorteio.tabelaDeChances();
const soma = tabela.reduce((a, f) => a + f.chance, 0);

check('a soma das chances é 100', Math.abs(soma - 100) < 1e-9, `(${soma})`);
check('nenhuma chance é negativa', tabela.every((f) => f.chance >= 0));
// As SORTEÁVEIS são cinco. A raridade `event` existe na ORDEM (para as
// comparações de "é isto ou melhor?" funcionarem) mas NUNCA entra aqui:
// carta de evento não sai de roll, e é isso que a torna exclusiva.
const SORTEAVEIS = sorteio.ORDEM.filter((r) => r !== 'event');

check('as cinco raridades sorteáveis estão na tabela',
    tabela.length === 5 && tabela.every((f) => SORTEAVEIS.includes(f.raridade)));

check('a raridade de EVENTO nunca entra na tabela',
    !tabela.some((f) => f.raridade === 'event'),
    '<- carta de evento não pode sair de roll');

console.log('\n=== As taxas são as da Fase 2 ===');
const taxa = (r) => tabela.find((f) => f.raridade === r).chance;

check('Comum 64', Math.abs(taxa('common') - 64) < 1e-9, `(${taxa('common')})`);
check('Rara 25', taxa('rare') === 25);
check('Ultra Rara 9,8', taxa('ultra rare') === 9.8);
check('Lendária 1,1', taxa('legendary') === 1.1);
check('Mestra 0,1', taxa('master') === 0.1);

console.log('\n=== A escassez é monótona ===');
// Se duas raridades empatarem ou inverterem, a hierarquia do jogo some.
let monotona = true;
for (let i = 1; i < SORTEAVEIS.length; i++) {
    if (taxa(SORTEAVEIS[i]) >= taxa(SORTEAVEIS[i - 1])) monotona = false;
}
check('cada raridade é mais rara que a anterior', monotona,
    `(${SORTEAVEIS.map((r) => pct(taxa(r))).join(' > ')})`);

console.log('\n=== A Mestra ficou mais rara que antes ===');
// A tabela antiga era 55/28/12/4/1. O ponto da Fase 2 é a ponta da
// escala, não a base.
check('Mestra 10x mais rara que a tabela antiga (1% -> 0,1%)', taxa('master') === 1 / 10);
check('Lendária mais rara que os 4% antigos', taxa('legendary') < 4);
check('Comum mais comum que os 55% antigos', taxa('common') > 55);

console.log('\n=== CHANCE_MESTRA ajusta sem quebrar a soma ===');
// A recomendação é cair para 0,05% quando passar de ~40 jogadores ativos.
for (const valor of [0.05, 0, 1, 5]) {
    const t = sorteio.tabelaDeChances(valor);
    const s = t.reduce((a, f) => a + f.chance, 0);
    const mestra = t.find((f) => f.raridade === 'master').chance;
    check(`CHANCE_MESTRA=${valor} mantém a soma em 100 e a Mestra no valor pedido`,
        Math.abs(s - 100) < 1e-9 && mestra === valor);
}

// Sem o teto, isto deixaria a Comum negativa e o sorteio devolveria
// coisas absurdas em silêncio.
const absurda = sorteio.tabelaDeChances(999);
check('valor absurdo no .env não deixa a Comum negativa',
    absurda.every((f) => f.chance >= 0)
    && Math.abs(absurda.reduce((a, f) => a + f.chance, 0) - 100) < 1e-9);

console.log('\n=== O sorteio respeita as faixas ===');
// Percentis logo dentro de cada faixa acumulada.
const puro = (p) => sorteio.sortearRaridade({ aleatorio: fixo(p) }).raridade;
check('percentil 0 cai em Comum', puro(0) === 'common');
check('percentil 63,9 ainda é Comum', puro(63.9) === 'common');
check('percentil 64,1 é Rara', puro(64.1) === 'rare');
check('percentil 89,1 é Ultra Rara', puro(89.1) === 'ultra rare');
check('percentil 98,9 é Lendária', puro(98.9) === 'legendary');
check('percentil 99,95 é Mestra', puro(99.95) === 'master');

console.log('\n=== A distribuição observada bate com a tabela ===');
// Gerador determinístico: o teste não pode falhar por azar.
function geradorPrevisivel(semente = 42) {
    let s = semente;
    return () => {
        s = (s * 1103515245 + 12345) % 2147483648;
        return s / 2147483648;
    };
}

const N = 200000;
const aleatorio = geradorPrevisivel();
const contagem = Object.fromEntries(SORTEAVEIS.map((r) => [r, 0]));
for (let i = 0; i < N; i++) {
    // Sem proteção: aqui se mede a tabela pura.
    contagem[sorteio.sortearRaridade({ aleatorio }).raridade]++;
}

for (const raridade of SORTEAVEIS) {
    const observado = (contagem[raridade] / N) * 100;
    const esperado = taxa(raridade);
    // Margem generosa na cauda: 0,1% de 200 mil são ~200 sorteios, e a
    // flutuação relativa de um evento raro é grande por natureza.
    const margem = Math.max(0.3, esperado * 0.25);
    check(`${raridade} perto de ${pct(esperado)}`,
        Math.abs(observado - esperado) <= margem,
        `(observado ${pct(observado)})`);
}

// ---------------------------------------------------------------------
console.log('\n=== AS DUAS REDES DE PROTEÇÃO ===');

const ULTRA = sorteio.LIMITES.rollsSemUltra;
const LEND = sorteio.LIMITES.rollsSemLendaria;

check('a rede de Ultra Rara é 40', ULTRA === 40);
check('a rede de Lendária é 300', LEND === 300);
check('só existem duas redes', sorteio.PROTECOES.length === 2);

console.log('\n--- A MESTRA NUNCA É GARANTIDA ---');
// A regra mais importante do arquivo: uma Mestra entregue por tempo de
// espera deixa de ser sorte e vira mensalidade.
check('nenhuma rede garante Mestra',
    sorteio.PROTECOES.every((p) => p.raridade !== 'master'));
check('não existe contador de Mestra',
    sorteio.PROTECOES.every((p) => !/mestra/i.test(p.campo)));

// Mesmo com os dois contadores absurdamente altos, o pior sorteio
// possível nunca vira Mestra.
const desesperado = sorteio.sortearRaridade({
    contadores: { rollsSemUltra: 99999, rollsSemLendaria: 99999 },
    aleatorio: fixo(0)
});
check('contadores enormes não produzem Mestra', desesperado.raridade !== 'master');
check('produzem a garantia mais forte, que é Lendária', desesperado.raridade === 'legendary');

console.log('\n--- rede de Ultra Rara (40) ---');
const azarado = (u, l = 0) => sorteio.sortearRaridade({
    contadores: { rollsSemUltra: u, rollsSemLendaria: l },
    aleatorio: fixo(0)   // percentil 0 = Comum no sorteio puro
});

check('em 39 continua Comum', azarado(ULTRA - 1).raridade === 'common');
check('em 40 vem Ultra Rara garantida',
    azarado(ULTRA).raridade === 'ultra rare' && azarado(ULTRA).garantida === 'ultra rare');
check('acima de 40 continua garantindo', azarado(ULTRA + 50).garantida === 'ultra rare');
check('contador negativo não quebra', azarado(-5).raridade === 'common');

console.log('\n--- rede de Lendária (300) ---');
check('em 299 a rede de Lendária ainda não age',
    azarado(0, LEND - 1).raridade === 'common');
check('em 300 vem Lendária garantida',
    azarado(0, LEND).raridade === 'legendary' && azarado(0, LEND).garantida === 'legendary');

console.log('\n--- quando as duas vencem, vale a melhor ---');
// Sem isto, a rede de Ultra rebaixaria o prêmio da rede de Lendária.
const duas = azarado(ULTRA + 10, LEND + 10);
check('as duas estouradas entregam Lendária, não Ultra Rara', duas.raridade === 'legendary');
check('e a garantia reportada é a de Lendária', duas.garantida === 'legendary');

console.log('\n--- a proteção nunca piora o roll ---');
// Se o sorteio deu Mestra, é Mestra que sai. Trocar por uma raridade
// menor faria do jogador mais azarado do servidor o único impedido de
// tirar uma Mestra, justo no roll prometido.
const sortudo = (p) => sorteio.sortearRaridade({
    contadores: { rollsSemUltra: 99999, rollsSemLendaria: 99999 },
    aleatorio: fixo(p)
});
check('Mestra no roll garantido continua Mestra', sortudo(99.95).raridade === 'master');
check('e não é marcada como garantida', sortudo(99.95).garantida === null);
check('Lendária sorteada não vira "garantida"', sortudo(98.9).garantida === null);

console.log('\n--- os limites são parametrizáveis (a Fase 6 baixa o de Ultra) ---');
const comLimite = (u, limite) => sorteio.sortearRaridade({
    contadores: { rollsSemUltra: u },
    limites: { rollsSemUltra: limite },
    aleatorio: fixo(0)
});
check('limite 25 garante em 25', comLimite(25, 25).garantida === 'ultra rare');
check('e ainda não garante em 24', comLimite(24, 25).garantida === null);

// ---------------------------------------------------------------------
console.log('\n=== OS CONTADORES ===');

const depois = (raridade, u = 0, l = 0) =>
    sorteio.proximosContadores(raridade, { rollsSemUltra: u, rollsSemLendaria: l });

console.log('\n--- o que zera o quê ---');
check('Comum sobe os dois',
    depois('common', 5, 90).rollsSemUltra === 6 && depois('common', 5, 90).rollsSemLendaria === 91);
check('Rara sobe os dois',
    depois('rare', 5, 90).rollsSemUltra === 6 && depois('rare', 5, 90).rollsSemLendaria === 91);
check('Ultra Rara zera o dela e SOBE o de Lendária',
    depois('ultra rare', 39, 90).rollsSemUltra === 0
    && depois('ultra rare', 39, 90).rollsSemLendaria === 91,
    '<- ainda não viu Lendária');
check('Lendária zera os dois',
    depois('legendary', 39, 290).rollsSemUltra === 0
    && depois('legendary', 39, 290).rollsSemLendaria === 0);

// Foi o pedido explícito: a Mestra não tem rede própria, mas está acima
// das duas — quem tirou uma Mestra não está sem sorte.
check('MESTRA zera os dois',
    depois('master', 39, 290).rollsSemUltra === 0
    && depois('master', 39, 290).rollsSemLendaria === 0);

console.log('\n--- detalhes ---');
check('MAIÚSCULA é aceita', depois('ULTRA RARE', 50).rollsSemUltra === 0);
check('sem contador anterior começa em 1', sorteio.proximosContadores('common').rollsSemUltra === 1);
check('raridade desconhecida não zera nada',
    depois('lixo', 30, 30).rollsSemUltra === 31 && depois('lixo', 30, 30).rollsSemLendaria === 31);

// O /roll cai para Comum quando o catálogo não tem carta da raridade
// sorteada. Se o contador zerasse pela raridade SORTEADA, o jogador
// levaria uma Comum e perderia a espera acumulada junto.
check('carta entregue Comum não zera, mesmo com Ultra sorteada',
    depois('common', ULTRA).rollsSemUltra === ULTRA + 1,
    '<- o fallback do catálogo');

// ---------------------------------------------------------------------
console.log('\n=== SIMULAÇÃO: ninguém passa dos limites ===');
// Pior sorte possível durante 2.000 rolls: as redes têm que segurar o teto.
let contadores = { rollsSemUltra: 0, rollsSemLendaria: 0 };
let picoUltra = 0;
let picoLend = 0;
for (let i = 0; i < 2000; i++) {
    const { raridade } = sorteio.sortearRaridade({ contadores, aleatorio: fixo(0) });
    contadores = sorteio.proximosContadores(raridade, contadores);
    picoUltra = Math.max(picoUltra, contadores.rollsSemUltra);
    picoLend = Math.max(picoLend, contadores.rollsSemLendaria);
}
check('sequência sem Ultra Rara nunca passa de 40', picoUltra <= ULTRA, `(pico ${picoUltra})`);
check('sequência sem Lendária nunca passa de 300', picoLend <= LEND, `(pico ${picoLend})`);

console.log('\n--- com sorte real, as redes quase não aparecem ---');
// A proteção é rede de segurança, não mecânica de jogo: se ela disparasse
// com frequência, a raridade viraria cronômetro.
const aleatorio2 = geradorPrevisivel(7);
let cont2 = { rollsSemUltra: 0, rollsSemLendaria: 0 };
let garantidos = 0;
const ROLLS = 50000;
for (let i = 0; i < ROLLS; i++) {
    const r = sorteio.sortearRaridade({ contadores: cont2, aleatorio: aleatorio2 });
    if (r.garantida) garantidos++;
    cont2 = sorteio.proximosContadores(r.raridade, cont2);
}
check('menos de 1% dos rolls são garantidos', garantidos / ROLLS < 0.01,
    `(${garantidos} em ${ROLLS.toLocaleString('pt-BR')} = ${pct((garantidos / ROLLS) * 100)})`);

console.log('\n--- rollsAteAGarantia ---');
const faltam = sorteio.rollsAteAGarantia({ rollsSemUltra: 38, rollsSemLendaria: 295 });
check('conta para trás nas duas redes',
    faltam.rollsSemUltra === 2 && faltam.rollsSemLendaria === 5);
check('e nunca fica negativo',
    sorteio.rollsAteAGarantia({ rollsSemUltra: 9999 }).rollsSemUltra === 0);

console.log(falhas === 0 ? '\n*** TODOS OS TESTES DE SORTEIO PASSARAM ***' : `\n*** ${falhas} FALHA(S) ***`);
process.exit(falhas ? 1 : 0);
