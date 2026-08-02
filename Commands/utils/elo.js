/**
 * Pontuação de ranking (ELO).
 *
 * Serve para dar sentido a batalhar além do dinheiro — hoje ganhar duelo
 * só rende moeda, e moeda já sobra na economia. Pontuação é um placar que
 * não infla.
 *
 * Usa o ELO clássico: ganhar de quem tem pontuação maior rende mais,
 * ganhar de quem tem muito menos rende quase nada. Isso desestimula ficar
 * caçando jogador fraco para subir.
 */

const ELO_INICIAL = 1000;
const K = 32;             // quanto uma partida pode mexer na pontuação
const PISO = 100;         // ninguém cai abaixo disso

const DIVISOES = [
    { nome: 'Bronze', emoji: '🥉', min: 0, cor: 0xCD7F32 },
    { nome: 'Prata', emoji: '🥈', min: 1100, cor: 0xC0C0C0 },
    { nome: 'Ouro', emoji: '🥇', min: 1250, cor: 0xFFD700 },
    { nome: 'Platina', emoji: '💎', min: 1400, cor: 0x5DADE2 },
    { nome: 'Diamante', emoji: '💠', min: 1550, cor: 0x00E5FF },
    { nome: 'Mestre', emoji: '🌟', min: 1700, cor: 0xE91E63 }
];

/** Probabilidade esperada de A vencer B. */
function expectativa(eloA, eloB) {
    return 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
}

/**
 * Calcula a nova pontuação dos dois lados.
 * @param {number} eloVencedor
 * @param {number} eloPerdedor
 * @returns {{vencedor: number, perdedor: number, ganho: number, perda: number}}
 */
function calcular(eloVencedor, eloPerdedor) {
    const esperadoVencedor = expectativa(eloVencedor, eloPerdedor);

    const ganho = Math.round(K * (1 - esperadoVencedor));
    // O perdedor nunca perde mais do que o vencedor ganhou, e nunca cai
    // do piso — perder 3 vezes seguidas não pode zerar meses de jogo.
    const perda = Math.min(ganho, Math.max(0, eloPerdedor - PISO));

    return {
        vencedor: eloVencedor + ganho,
        perdedor: eloPerdedor - perda,
        ganho,
        perda
    };
}

/** Empate: os dois convergem levemente um para o outro. */
function calcularEmpate(eloA, eloB) {
    const esperadoA = expectativa(eloA, eloB);
    const ajusteA = Math.round(K * (0.5 - esperadoA));
    return {
        a: Math.max(PISO, eloA + ajusteA),
        b: Math.max(PISO, eloB - ajusteA),
        ajuste: ajusteA
    };
}

function divisao(elo) {
    return [...DIVISOES].reverse().find((d) => elo >= d.min) || DIVISOES[0];
}

/** Quanto falta para a próxima divisão (null se já está na última). */
function proximaDivisao(elo) {
    const acima = DIVISOES.find((d) => d.min > elo);
    return acima ? { ...acima, faltam: acima.min - elo } : null;
}

module.exports = {
    ELO_INICIAL,
    K,
    PISO,
    DIVISOES,
    expectativa,
    calcular,
    calcularEmpate,
    divisao,
    proximaDivisao
};
