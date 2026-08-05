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
const ORDEM = ['common', 'rare', 'ultra rare', 'legendary', 'master'];

/** A partir daqui o roll conta como "sorte boa" e zera a proteção. */
const RARIDADE_DA_PROTECAO = 'ultra rare';

/** Taxas fixas. A Comum não está aqui porque é o resto — ver o cabeçalho. */
const CHANCES = {
    rare: 25,
    'ultra rare': 9.8,
    legendary: 1.1
};

const CHANCE_MESTRA_PADRAO = 0.1;

/**
 * Quantos rolls sem Ultra Rara+ até o jogo garantir uma.
 *
 * Probabilidade independente é cruel: com 11% de chance de Ultra+, a cada
 * 1.000 jogadores há quem passe de 120 rolls sem ver nenhuma. Não é
 * hipótese, é o que a distribuição geométrica manda acontecer — e essa
 * pessoa desiste do bot achando que está quebrado.
 *
 * 120 quase não muda a distribuição (pouquíssimos chegam lá) e elimina o
 * pior cenário possível de experiência.
 */
const LIMITE_PROTECAO_PADRAO = 120;

function numeroDoEnv(nome, padrao) {
    const bruto = Number(process.env[nome]);
    return Number.isFinite(bruto) && bruto >= 0 ? bruto : padrao;
}

const CHANCE_MESTRA = numeroDoEnv('CHANCE_MESTRA', CHANCE_MESTRA_PADRAO);
const LIMITE_PROTECAO = numeroDoEnv('ROLLS_ATE_ULTRA_GARANTIDA', LIMITE_PROTECAO_PADRAO) || LIMITE_PROTECAO_PADRAO;

/** Posição na escala de raridade. -1 para raridade desconhecida. */
function posicao(raridade) {
    return ORDEM.indexOf(String(raridade || '').toLowerCase().trim());
}

/** A carta conta como "sorte boa"? (Ultra Rara ou melhor) */
function contaComoSorte(raridade) {
    const p = posicao(raridade);
    return p >= 0 && p >= posicao(RARIDADE_DA_PROTECAO);
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
 * Sorteia a raridade do roll, aplicando a proteção contra azar.
 *
 * ## A proteção MELHORA o resultado, nunca piora
 *
 * Quando ela dispara, o sorteio normal já aconteceu. Se ele tinha dado
 * Lendária ou Mestra, é esse resultado que vale — a proteção só levanta o
 * piso até Ultra Rara.
 *
 * Se ela substituísse o sorteio por "Ultra Rara" direto, o jogador com
 * mais azar do servidor seria o único do jogo impedido de tirar uma
 * Mestra, justamente no roll que o jogo prometeu como recompensa.
 *
 * @param {object} opts
 * @param {number} [opts.rollsSemUltra]  contador atual do jogador
 * @param {number} [opts.limite]         rolls até garantir (Fase 6 baixa para 100)
 * @param {number} [opts.chanceMestra]
 * @param {() => number} [opts.aleatorio] injetável para os testes
 * @returns {{ raridade: string, garantida: boolean }}
 */
function sortearRaridade({
    rollsSemUltra = 0,
    limite = LIMITE_PROTECAO,
    chanceMestra = CHANCE_MESTRA,
    aleatorio = Math.random
} = {}) {
    const sorteada = sortearPelaTabela(aleatorio, chanceMestra);

    if (contaComoSorte(sorteada)) {
        return { raridade: sorteada, garantida: false };
    }

    const seco = Math.max(0, Number(rollsSemUltra) || 0);
    if (seco >= limite) {
        return { raridade: RARIDADE_DA_PROTECAO, garantida: true };
    }

    return { raridade: sorteada, garantida: false };
}

/**
 * O contador depois deste roll.
 *
 * ⚠️ Recebe a raridade da carta que o jogador REALMENTE recebeu, não a
 * que foi sorteada. O /roll cai para uma Comum quando não existe carta da
 * raridade sorteada no catálogo — e nesse caso a proteção não pode zerar,
 * senão o jogador leva uma Comum e perde os 120 rolls de espera junto.
 */
function proximoContador(raridadeObtida, contadorAtual = 0) {
    if (contaComoSorte(raridadeObtida)) return 0;
    return Math.max(0, Number(contadorAtual) || 0) + 1;
}

/** Quantos rolls faltam para a garantia. 0 = o próximo já vem garantido. */
function rollsAteAGarantia(contadorAtual = 0, limite = LIMITE_PROTECAO) {
    return Math.max(0, limite - Math.max(0, Number(contadorAtual) || 0));
}

module.exports = {
    ORDEM,
    CHANCES,
    CHANCE_MESTRA,
    CHANCE_MESTRA_PADRAO,
    LIMITE_PROTECAO,
    LIMITE_PROTECAO_PADRAO,
    RARIDADE_DA_PROTECAO,
    posicao,
    contaComoSorte,
    tabelaDeChances,
    sortearRaridade,
    proximoContador,
    rollsAteAGarantia
};
