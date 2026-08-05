/**
 * Testes da tabela de raridade e da proteção contra azar.
 *
 * A tabela morava solta dentro do `rollRun.js` e era a regra mais
 * delicada do jogo sem um único teste. O que precisa valer sempre:
 *
 * - A soma fecha em 100. Uma tabela somando 99,9 não quebra nada: só faz
 *   a Mestra nunca sair, e ninguém percebe por semanas.
 * - A escassez é monótona: cada raridade é mais rara que a anterior.
 * - A proteção contra azar NUNCA piora um roll. Se o sorteio deu Mestra,
 *   é Mestra que sai — mesmo no roll garantido.
 * - O contador zera pela carta ENTREGUE, não pela sorteada.
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
check('todas as cinco raridades estão na tabela',
    tabela.length === 5 && tabela.every((f) => sorteio.ORDEM.includes(f.raridade)));

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
for (let i = 1; i < sorteio.ORDEM.length; i++) {
    if (taxa(sorteio.ORDEM[i]) >= taxa(sorteio.ORDEM[i - 1])) monotona = false;
}
check('cada raridade é mais rara que a anterior', monotona,
    `(${sorteio.ORDEM.map((r) => pct(taxa(r))).join(' > ')})`);

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
check('percentil 0 cai em Comum', sorteio.sortearRaridade({ aleatorio: fixo(0) }).raridade === 'common');
check('percentil 63,9 ainda é Comum', sorteio.sortearRaridade({ aleatorio: fixo(63.9) }).raridade === 'common');
check('percentil 64,1 é Rara', sorteio.sortearRaridade({ aleatorio: fixo(64.1) }).raridade === 'rare');
check('percentil 89,1 é Ultra Rara', sorteio.sortearRaridade({ aleatorio: fixo(89.1) }).raridade === 'ultra rare');
check('percentil 98,9 é Lendária', sorteio.sortearRaridade({ aleatorio: fixo(98.9) }).raridade === 'legendary');
check('percentil 99,95 é Mestra', sorteio.sortearRaridade({ aleatorio: fixo(99.95) }).raridade === 'master');

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
const contagem = Object.fromEntries(sorteio.ORDEM.map((r) => [r, 0]));
for (let i = 0; i < N; i++) {
    // Sem proteção: aqui se mede a tabela pura.
    contagem[sorteio.sortearRaridade({ aleatorio, limite: Infinity }).raridade]++;
}

for (const raridade of sorteio.ORDEM) {
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
console.log('\n=== PROTEÇÃO CONTRA AZAR ===');

const LIMITE = sorteio.LIMITE_PROTECAO;
check('o limite padrão é 120', LIMITE === 120);

// Percentil 0 = Comum garantida no sorteio puro. É o pior caso.
const azarado = (seco) => sorteio.sortearRaridade({ rollsSemUltra: seco, aleatorio: fixo(0) });

check('abaixo do limite continua Comum',
    azarado(LIMITE - 1).raridade === 'common' && azarado(LIMITE - 1).garantida === false);
check('no limite vem Ultra Rara garantida',
    azarado(LIMITE).raridade === 'ultra rare' && azarado(LIMITE).garantida === true);
check('acima do limite continua garantindo', azarado(LIMITE + 50).garantida === true);
check('contador negativo não quebra', azarado(-5).raridade === 'common');

console.log('\n--- a proteção nunca piora o roll ---');
// Se o sorteio deu Mestra, é Mestra que sai — mesmo no roll garantido.
// Trocar por "Ultra Rara" faria do jogador mais azarado do servidor o
// único impedido de tirar uma Mestra, justo no roll prometido.
const sortudoNoLimite = sorteio.sortearRaridade({ rollsSemUltra: LIMITE, aleatorio: fixo(99.95) });
check('Mestra no roll garantido continua Mestra', sortudoNoLimite.raridade === 'master');
check('e não é marcada como garantida', sortudoNoLimite.garantida === false);
check('Lendária no roll garantido continua Lendária',
    sorteio.sortearRaridade({ rollsSemUltra: LIMITE, aleatorio: fixo(98.9) }).raridade === 'legendary');

console.log('\n--- o limite é parametrizável (a Fase 6 baixa para 100) ---');
check('limite 100 garante em 100',
    sorteio.sortearRaridade({ rollsSemUltra: 100, limite: 100, aleatorio: fixo(0) }).garantida === true);
check('e ainda não garante em 99',
    sorteio.sortearRaridade({ rollsSemUltra: 99, limite: 100, aleatorio: fixo(0) }).garantida === false);

console.log('\n--- o contador ---');
check('Comum incrementa', sorteio.proximoContador('common', 7) === 8);
check('Rara incrementa', sorteio.proximoContador('rare', 7) === 8);
check('Ultra Rara zera', sorteio.proximoContador('ultra rare', 119) === 0);
check('Lendária zera', sorteio.proximoContador('legendary', 119) === 0);
check('Mestra zera', sorteio.proximoContador('master', 119) === 0);
check('MAIÚSCULA é aceita', sorteio.proximoContador('ULTRA RARE', 50) === 0);
check('sem contador anterior começa em 1', sorteio.proximoContador('common') === 1);
check('raridade desconhecida não zera', sorteio.proximoContador('lixo', 30) === 31);

// O /roll cai para Comum quando o catálogo não tem carta da raridade
// sorteada. Se o contador zerasse pela raridade SORTEADA, o jogador
// levaria uma Comum e perderia os 120 rolls de espera junto.
check('carta entregue Comum não zera, mesmo com Ultra sorteada',
    sorteio.proximoContador('common', LIMITE) === LIMITE + 1,
    '<- o fallback do catálogo');

console.log('\n--- ninguém passa do limite sem garantia ---');
// Simula a pior sorte possível durante 500 rolls e confere que a
// proteção segura o teto.
let contador = 0;
let maiorSequencia = 0;
for (let i = 0; i < 500; i++) {
    const { raridade } = sorteio.sortearRaridade({ rollsSemUltra: contador, aleatorio: fixo(0) });
    contador = sorteio.proximoContador(raridade, contador);
    maiorSequencia = Math.max(maiorSequencia, contador);
}
check('com azar absoluto, a sequência sem Ultra nunca passa do limite',
    maiorSequencia <= LIMITE, `(maior sequência: ${maiorSequencia})`);

check('rollsAteAGarantia conta para trás', sorteio.rollsAteAGarantia(118) === 2);
check('e nunca fica negativo', sorteio.rollsAteAGarantia(999) === 0);

console.log(falhas === 0 ? '\n*** TODOS OS TESTES DE SORTEIO PASSARAM ***' : `\n*** ${falhas} FALHA(S) ***`);
process.exit(falhas ? 1 : 0);
