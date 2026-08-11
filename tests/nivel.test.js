/**
 * Testes do nível de jogador.
 *
 * ## O que precisa valer sempre
 *
 * - **Carga de roll não aumenta o teto diário.** Com cooldown de 15 min o
 *   jogo gera 96 rolls por dia, com ou sem carga. A carga impede que os
 *   não usados sejam perdidos — levanta o piso, não o teto. Se este teste
 *   quebrar, o nível virou vantagem em vez de justiça.
 * - **Com uma carga só, o comportamento é o de hoje.** É o que garante que
 *   ninguém que já joga perceba diferença, e que não haja migração.
 * - Rolar com várias cargas não descarta as sobrando.
 * - Subir vários níveis de uma vez entrega TODAS as recompensas do
 *   caminho, não só a do último.
 */

const path = require('path');
const ROOT = path.join(__dirname, '..', 'Commands', 'utils') + path.sep;

const nivel = require(ROOT + 'level.js');

let falhas = 0;
const check = (nome, cond, extra = '') => {
    console.log(`  ${cond ? 'OK  ' : 'FALHOU'} ${nome} ${extra}`);
    if (!cond) falhas++;
};

const MIN = 60 * 1000;
const COOLDOWN = 15 * MIN;

/**
 * Base de tempo realista.
 *
 * A primeira versão destes testes começava em `agora = 0`, e travou num
 * laço infinito: `proximoLastRoll` devolvia 0, e `lastRoll = 0` significa
 * "nunca rolou", que devolve o teto cheio de cargas — de volta ao começo,
 * para sempre.
 *
 * Foi teste ruim que achou bug de verdade: o roll extra da loja gravava
 * `lastRoll = 0` para liberar um roll, e com as cargas por nível isso
 * entregaria o teto inteiro. Hoje ele recua um cooldown.
 */
const T0 = Date.UTC(2026, 0, 1);

console.log('=== A CARGA NÃO AUMENTA O TETO DIÁRIO ===');
//
// É o teste que sustenta a decisão de dar carga em vez de odds melhores.
// Simulamos um dia inteiro de alguém colado no bot: ele rola sempre que
// pode, e o total tem que ser o mesmo com 1 ou com 4 cargas.
function rollsEmUmDia(maximo) {
    const DIA = 24 * 60 * MIN;
    let agora = T0;
    let lastRoll = T0;
    let rolls = 0;

    // Passo de 1 minuto: fino o suficiente para não perder janela.
    while (agora <= T0 + DIA) {
        const cargas = nivel.cargasDisponiveis(lastRoll, COOLDOWN, maximo, agora);
        if (cargas > 0) {
            rolls++;
            lastRoll = nivel.proximoLastRoll(cargas, COOLDOWN, agora);
        }
        agora += MIN;
    }
    return rolls;
}

const comUma = rollsEmUmDia(1);
const comQuatro = rollsEmUmDia(4);

check('quem fica 24h no bot rola o mesmo com 1 ou 4 cargas',
    comUma === comQuatro, `(${comUma} vs ${comQuatro})`);
check('e esse total é o teto do cooldown', comUma <= (24 * 60) / 15 + 1,
    `(${comUma}, teto teórico 96)`);

console.log('\n=== Mas a carga salva quem tem vida ===');
//
// O jogador entra 3 vezes por dia. Sem carga ele perde tudo que passou
// entre as visitas; com carga, leva o que couber no teto.
function rollsComVisitas(maximo, visitasPorDia) {
    const DIA = 24 * 60 * MIN;
    const intervalo = DIA / visitasPorDia;
    let lastRoll = T0;
    let rolls = 0;

    for (let v = 0; v < visitasPorDia; v++) {
        const agora = T0 + v * intervalo;
        // Na visita, rola tudo que puder.
        let cargas = nivel.cargasDisponiveis(lastRoll, COOLDOWN, maximo, agora);
        while (cargas > 0) {
            rolls++;
            lastRoll = nivel.proximoLastRoll(cargas, COOLDOWN, agora);
            cargas = nivel.cargasDisponiveis(lastRoll, COOLDOWN, maximo, agora);
        }
    }
    return rolls;
}

const visitasSemCarga = rollsComVisitas(1, 3);
const visitasComCarga = rollsComVisitas(4, 3);

check('quem entra 3x por dia rola mais com carga',
    visitasComCarga > visitasSemCarga, `(${visitasSemCarga} -> ${visitasComCarga})`);
check('e mesmo assim fica abaixo do teto de 24h',
    visitasComCarga < comUma, `(${visitasComCarga} < ${comUma})`);

console.log('\n=== Uma carga = comportamento de hoje ===');
// Sem isto haveria migração: quem já joga acordaria com rolls guardados.
check('sem tempo decorrido, nada disponível',
    nivel.cargasDisponiveis(T0, COOLDOWN, 1, T0) === 0);
check('faltando 1 min, ainda nada',
    nivel.cargasDisponiveis(T0, COOLDOWN, 1, T0 + COOLDOWN - MIN) === 0);
check('no cooldown exato, uma carga',
    nivel.cargasDisponiveis(T0, COOLDOWN, 1, T0 + COOLDOWN) === 1);
check('muito tempo depois, ainda uma só',
    nivel.cargasDisponiveis(T0, COOLDOWN, 1, T0 + COOLDOWN * 50) === 1);

console.log('\n=== Acúmulo até o teto ===');
check('2 cooldowns dão 2 cargas',
    nivel.cargasDisponiveis(T0, COOLDOWN, 4, T0 + COOLDOWN * 2) === 2);
check('10 cooldowns com teto 4 dão 4',
    nivel.cargasDisponiveis(T0, COOLDOWN, 4, T0 + COOLDOWN * 10) === 4);
check('jogador novo já começa cheio',
    nivel.cargasDisponiveis(0, COOLDOWN, 3, T0) === 3);

console.log('\n=== Gastar uma carga não descarta as outras ===');
// O bug óbvio seria mandar lastRoll para agora: quem tinha 3 perderia 2.
const agora = T0 + COOLDOWN * 10;
const tinha = nivel.cargasDisponiveis(T0, COOLDOWN, 3, agora);
const depois = nivel.proximoLastRoll(tinha, COOLDOWN, agora);
check('tinha 3', tinha === 3);
check('sobram 2 depois de gastar 1',
    nivel.cargasDisponiveis(depois, COOLDOWN, 3, agora) === 2);

// E gastando as três em sequência, no mesmo instante.
let lr = T0;
let usadas = 0;
let c = nivel.cargasDisponiveis(lr, COOLDOWN, 3, agora);
while (c > 0) {
    usadas++;
    lr = nivel.proximoLastRoll(c, COOLDOWN, agora);
    c = nivel.cargasDisponiveis(lr, COOLDOWN, 3, agora);
}
check('dá para gastar as 3 de uma vez', usadas === 3, `(${usadas})`);
check('e depois espera o cooldown cheio',
    nivel.prontoEm(lr, COOLDOWN, 3, agora) === lr + COOLDOWN);

console.log('\n=== Cargas por nível ===');
check('nível 1 tem 1 carga', nivel.maxCargas(1) === 1);
check('nível 9 ainda tem 1', nivel.maxCargas(9) === 1);
check('nível 10 sobe para 2', nivel.maxCargas(10) === 2);
check('nível 19 continua 2', nivel.maxCargas(19) === 2);
check('nível 20 sobe para 3', nivel.maxCargas(20) === 3);
check('nível 30 sobe para 4', nivel.maxCargas(30) === 4);
check('nível 99 não passa de 4', nivel.maxCargas(99) === 4);
check('nível inválido cai em 1', nivel.maxCargas(null) === 1);

console.log('\n=== A curva de XP ===');
check('nível 1 começa em 0', nivel.xpDoNivel(1) === 0);
check('ida e volta batem', [1, 2, 5, 10, 20, 30, 50].every(
    (n) => nivel.nivelDoXp(nivel.xpDoNivel(n)) === n));
check('1 XP antes do marco ainda é o nível anterior',
    nivel.nivelDoXp(nivel.xpDoNivel(10) - 1) === 9);
check('cada nível custa mais que o anterior',
    [2, 5, 10, 20].every((n) =>
        (nivel.xpDoNivel(n + 1) - nivel.xpDoNivel(n)) > (nivel.xpDoNivel(n) - nivel.xpDoNivel(n - 1))));
check('XP zero é nível 1', nivel.nivelDoXp(0) === 1);
check('XP negativo não quebra', nivel.nivelDoXp(-500) === 1);

console.log('\n=== Ritmo esperado ===');
// ~360 XP/dia para quem faz 25 rolls, 2 batalhas, o diário e uma missão.
const PORDIA = 25 * nivel.XP.roll + 2 * nivel.XP.batalha + nivel.XP.diario + nivel.XP.missao;
const dias = (n) => Math.ceil(nivel.xpDoNivel(n) / PORDIA);
console.log(`  (jogador de ${PORDIA} XP/dia)`);
check('nível 10 leva entre 5 e 30 dias', dias(10) >= 5 && dias(10) <= 30, `(${dias(10)} dias)`);
check('nível 30 leva mais de 60 dias', dias(30) > 60, `(${dias(30)} dias)`);
check('nível 20 vem antes do 30', dias(20) < dias(30));

console.log('\n=== Progresso dentro do nível ===');
const p = nivel.progresso(nivel.xpDoNivel(5));
check('no marco, percentual zerado', p.percentual === 0 && p.nivel === 5);
check('faltam exatamente a faixa inteira', p.faltam === p.paraOProximo);

const meio = nivel.progresso(nivel.xpDoNivel(5) + (nivel.xpDoNivel(6) - nivel.xpDoNivel(5)) / 2);
check('no meio, ~50%', Math.abs(meio.percentual - 50) < 1, `(${meio.percentual.toFixed(1)}%)`);
check('percentual nunca passa de 100',
    [0, 1, 999, 99999, 1e9].every((x) => nivel.progresso(x).percentual < 100));

console.log('\n=== Subir vários níveis de uma vez ===');
// Resgatar várias missões juntas pode pular níveis. Entregar só o último
// faria o jogador perder as recompensas do caminho.
const pulou = nivel.niveisCruzados(0, nivel.xpDoNivel(4));
check('cruzou 2, 3 e 4', pulou.join(',') === '2,3,4', `(${pulou.join(',')})`);
check('sem XP novo, nenhum nível', nivel.niveisCruzados(500, 500).length === 0);
check('XP que não cruza marco não sobe',
    nivel.niveisCruzados(nivel.xpDoNivel(5), nivel.xpDoNivel(5) + 1).length === 0);

console.log('\n=== Recompensas ===');
check('todo nível tem recompensa',
    [2, 3, 5, 7, 10, 13, 20, 33, 50, 77].every((n) => {
        const r = nivel.recompensaDoNivel(n);
        return r && Object.keys(r).length > 0;
    }));
check('os marcos de carga estão marcados',
    nivel.NIVEIS_DE_CARGA.every((n) => nivel.recompensaDoNivel(n).cargas === true));
check('nível sem entrada própria ganha moedas',
    nivel.recompensaDoNivel(77).moedas > 0);
check('a recompensa padrão cresce com o nível',
    nivel.recompensaPadrao(50).moedas > nivel.recompensaPadrao(10).moedas);

console.log('\n=== Toda ação que dá XP tem valor positivo ===');
for (const [acao, valor] of Object.entries(nivel.XP)) {
    check(`${acao} rende XP`, Number.isInteger(valor) && valor > 0, `(${valor})`);
}
check('rolar rende menos que descobrir', nivel.XP.roll < nivel.XP.descoberta);

console.log(falhas === 0 ? '\n*** TODOS OS TESTES DE NÍVEL PASSARAM ***' : `\n*** ${falhas} FALHA(S) ***`);
process.exit(falhas ? 1 : 0);
