/**
 * Que raridade sai no /roll.
 *
 * ## Por que isto saiu do rollRun.js
 *
 * A tabela morava solta no meio do comando, entre um `deferReply` e uma
 * consulta ao banco. Não dava para testar a distribuição sem subir um
 * cliente de Discord, e a regra mais delicada do jogo era a única sem
 * teste nenhum.
 *
 * ## As taxas
 *
 * | | Comum | Rara | Ultra | Lendária | Mestra |
 * |---|---|---|---|---|---|
 * | Antes | 55 | 28 | 12 | 4 | 1 |
 * | Agora | 64 | 25 | 9,8 | 1,1 | 0,1 |
 *
 * A Mestra a 0,1% é 1 a cada 1.000 rolls — ~33 dias para quem rola 30 por
 * dia. Para efeito de comparação, a faca de uma caixa do CS é 0,26%: a
 * Mestra fica 2,6x mais rara, o que se justifica porque aqui a caixa é
 * grátis.
 *
 * ## A Comum é o RESTO, e isso é de propósito
 *
 * Ela não tem número próprio: é 100 menos todas as outras. Assim a soma
 * fecha em 100 sozinha, e mexer numa taxa não obriga ninguém a recontar o
 * total à mão — que é o tipo de erro que ninguém percebe, porque uma
 * tabela somando 99,9 não quebra nada: só faz o último item do laço nunca
 * sair.
 *
 * ## Por que a Mestra é ajustável sem deploy
 *
 * A sensação de "evento do servidor" não depende da taxa individual, e
 * sim do volume de rolls do servidor inteiro:
 *
 * | Jogadores ativos | Uma Mestra a cada |
 * |---|---|
 * | 10 | ~3 dias |
 * | 25 | ~32 horas |
 * | 50 | ~16 horas |
 * | 100 | ~8 horas |
 *
 * Com a beta pequena, 0,1% já dá a sensação certa. Passando de ~40
 * jogadores ativos, `CHANCE_MESTRA=0.05` no .env corrige sem PR.
 */

/** Da mais comum para a mais rara. A ordem é usada para comparar. */
// Evento entra no fim para as comparações de "é isto ou melhor?"
// funcionarem. Ela NUNCA aparece em `tabelaDeChances`, entao nao ha
// caminho para sair de um /roll.
const ORDEM = ['common', 'rare', 'ultra rare', 'legendary', 'master', 'event'];

/** Taxas fixas. A Comum não está aqui porque é o resto — ver o cabeçalho. */
const CHANCES = {
    rare: 25,
    'ultra rare': 9.8,
    legendary: 1.1
};

const CHANCE_MESTRA_PADRAO = 0.1;

/**
 * ## Proteção contra azar
 *
 * Probabilidade independente é cruel: o sorteio não deve nada a quem está
 * sem sorte. Sempre existe uma minoria com azar absurdo, e essa pessoa
 * não pensa "estou na cauda ruim da distribuição" — ela pensa que o bot
 * está quebrado, e para de jogar.
 *
 * São DUAS redes, com réguas diferentes, porque as duas frustrações são
 * diferentes.
 *
 * ### Por que duas, e por que estes números
 *
 * A primeira versão disto tinha uma rede só: Ultra Rara+ em 120 rolls. O
 * número parecia conservador e era, na prática, código morto —
 * Ultra Rara+ é 11% por roll, uma a cada 9:
 *
 * | Rolls secos | Chance de acontecer |
 * |---|---|
 * | 20 | 1 em 10 |
 * | 40 | 1 em 106 |
 * | 60 | 1 em 1.088 |
 * | 120 | **1 em 1.183.584** |
 *
 * Com 10 jogadores rolando 30 vezes por dia, uma sequência de 120
 * apareceria a cada ~10 anos de servidor.
 *
 * Pior: o azar que faz alguém desistir nunca foi o de Ultra Rara. É o de
 * Lendária, que é 1,2% por roll — uma a cada 83:
 *
 * | Rolls sem Lendária+ | Chance |
 * |---|---|
 * | 120 | **1 em 4** |
 * | 300 | 1 em 37 |
 * | 800 | 1 em 15.647 |
 *
 * Um em cada quatro jogadores passa 120 rolls sem Lendária. A rede de 120
 * em Ultra Rara não encostava nesse caso.
 *
 * Daí as duas réguas: **Ultra Rara em 40** (pega o 1% mais azarado, age
 * em silêncio e com frequência) e **Lendária em 300** (pega o pior ~3% e
 * é o que evita a desistência).
 *
 * ### A Mestra NUNCA é garantida
 *
 * Ela é a única raridade sem rede, de propósito: uma Mestra que o jogo
 * entrega por tempo de espera deixa de ser sorte e vira mensalidade. O
 * que ela faz é ZERAR as duas redes quando sai, porque está acima das
 * duas — quem tirou uma Mestra não está sem sorte.
 */
const PROTECOES = [
    { raridade: 'ultra rare', campo: 'rollsSemUltra', env: 'ROLLS_ATE_ULTRA_GARANTIDA', padrao: 40 },
    { raridade: 'legendary', campo: 'rollsSemLendaria', env: 'ROLLS_ATE_LENDARIA_GARANTIDA', padrao: 300 }
];

function numeroDoEnv(nome, padrao) {
    const bruto = Number(process.env[nome]);
    return Number.isFinite(bruto) && bruto > 0 ? bruto : padrao;
}

const CHANCE_MESTRA = (() => {
    const bruto = Number(process.env.CHANCE_MESTRA);
    return Number.isFinite(bruto) && bruto >= 0 ? bruto : CHANCE_MESTRA_PADRAO;
})();

/** Limites em vigor, já com o .env aplicado. */
const LIMITES = Object.fromEntries(
    PROTECOES.map((p) => [p.campo, numeroDoEnv(p.env, p.padrao)])
);

/** Posição na escala de raridade. -1 para raridade desconhecida. */
function posicao(raridade) {
    return ORDEM.indexOf(String(raridade || '').toLowerCase().trim());
}

/** A carta obtida está no nível `alvo` ou acima? */
function alcanca(raridade, alvo) {
    const p = posicao(raridade);
    return p >= 0 && p >= posicao(alvo);
}

function contadorValido(valor) {
    return Math.max(0, Number(valor) || 0);
}

/**
 * A tabela de chances, já com a Comum fechando os 100%.
 * @returns {Array<{ raridade: string, chance: number }>}
 */
function tabelaDeChances(chanceMestra = CHANCE_MESTRA) {
    const fixas = Object.values(CHANCES).reduce((a, b) => a + b, 0);

    // Teto: a Mestra não pode comer a Comum inteira. Sem isto, um
    // `CHANCE_MESTRA=99` no .env deixaria a Comum negativa e o sorteio
    // devolveria coisas absurdas em silêncio.
    const mestra = Math.min(Math.max(Number(chanceMestra) || 0, 0), 100 - fixas);

    return [
        { raridade: 'common', chance: 100 - fixas - mestra },
        { raridade: 'rare', chance: CHANCES.rare },
        { raridade: 'ultra rare', chance: CHANCES['ultra rare'] },
        { raridade: 'legendary', chance: CHANCES.legendary },
        { raridade: 'master', chance: mestra }
    ];
}

/** Sorteio puro, sem proteção contra azar. */
function sortearPelaTabela(aleatorio, chanceMestra) {
    const alvo = aleatorio() * 100;
    let acumulado = 0;
    for (const faixa of tabelaDeChances(chanceMestra)) {
        acumulado += faixa.chance;
        if (alvo < acumulado) return faixa.raridade;
    }
    // Só chega aqui por arredondamento de ponto flutuante no limite.
    return 'common';
}

/**
 * Sorteia a raridade do roll, aplicando as proteções contra azar.
 *
 * ## A proteção MELHORA o resultado, nunca piora
 *
 * Quando ela dispara, o sorteio normal já aconteceu. Se ele tinha dado
 * algo melhor, é esse resultado que vale — a proteção só levanta o piso.
 *
 * Se ela substituísse o sorteio, o jogador com mais azar do servidor
 * seria o único do jogo impedido de tirar uma Mestra, justamente no roll
 * que o jogo prometeu como recompensa.
 *
 * Quando as duas redes vencem no mesmo roll, vale a melhor.
 *
 * @param {object} opts
 * @param {object} [opts.contadores]  { rollsSemUltra, rollsSemLendaria }
 * @param {object} [opts.limites]     sobrescreve por campo (a Fase 6 baixa o de Ultra)
 * @param {number} [opts.chanceMestra]
 * @param {() => number} [opts.aleatorio] injetável para os testes
 * @returns {{ raridade: string, garantida: string|null }}
 */
function sortearRaridade({
    contadores = {},
    limites = {},
    chanceMestra = CHANCE_MESTRA,
    aleatorio = Math.random
} = {}) {
    const sorteada = sortearPelaTabela(aleatorio, chanceMestra);

    // Da rede mais forte para a mais fraca: se as duas venceram, a de
    // Lendária manda, senão a de Ultra rebaixaria o prêmio da outra.
    for (const protecao of [...PROTECOES].reverse()) {
        const limite = limites[protecao.campo] ?? LIMITES[protecao.campo];
        const seco = contadorValido(contadores[protecao.campo]);

        if (seco >= limite && !alcanca(sorteada, protecao.raridade)) {
            return { raridade: protecao.raridade, garantida: protecao.raridade };
        }
    }

    return { raridade: sorteada, garantida: null };
}

/**
 * Os contadores depois deste roll.
 *
 * ⚠️ Recebe a raridade da carta que o jogador REALMENTE recebeu, não a
 * que foi sorteada. O /roll cai para uma Comum quando não existe carta da
 * raridade sorteada no catálogo — e nesse caso a proteção não pode zerar,
 * senão o jogador leva uma Comum e perde a espera acumulada junto.
 *
 * Uma Mestra zera as duas redes: ela não tem rede própria, mas está acima
 * das duas, e quem tirou uma Mestra não está sem sorte.
 */
function proximosContadores(raridadeObtida, contadores = {}) {
    const saida = {};
    for (const protecao of PROTECOES) {
        saida[protecao.campo] = alcanca(raridadeObtida, protecao.raridade)
            ? 0
            : contadorValido(contadores[protecao.campo]) + 1;
    }
    return saida;
}

/**
 * Quantos rolls faltam para cada garantia.
 * 0 = o próximo já vem garantido.
 */
function rollsAteAGarantia(contadores = {}, limites = {}) {
    const saida = {};
    for (const protecao of PROTECOES) {
        const limite = limites[protecao.campo] ?? LIMITES[protecao.campo];
        saida[protecao.campo] = Math.max(0, limite - contadorValido(contadores[protecao.campo]));
    }
    return saida;
}

module.exports = {
    ORDEM,
    CHANCES,
    CHANCE_MESTRA,
    CHANCE_MESTRA_PADRAO,
    PROTECOES,
    LIMITES,
    posicao,
    alcanca,
    tabelaDeChances,
    sortearRaridade,
    proximosContadores,
    rollsAteAGarantia
};
