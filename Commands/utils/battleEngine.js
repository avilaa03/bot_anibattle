/**
 * Motor de combate 1v1 e 3v3.
 *
 * Atributos:
 *   ATA — velocidade. Pesa na ordem dos turnos, no crítico e na esquiva.
 *   LIF — vida.
 *   POW — dano base por golpe.
 *
 * Filosofia do balanceamento: a sorte existe, mas é *enviesada a favor da
 * carta melhor*. Os números abaixo foram calibrados por simulação para que:
 *
 *   - cartas da mesma raridade fiquem em ~50% (moeda ao alto, emocionante)
 *   - uma raridade acima vença ~70-89% (vantagem clara, mas não garantida)
 *   - duas raridades acima vença ~90%+ (praticamente decidido)
 *
 * Se fosse puramente determinístico (quem tem mais atributo sempre ganha),
 * a batalha viraria consulta de tabela e o jogador perderia a graça de
 * torcer. Se fosse pura sorte, colecionar cartas boas não teria sentido.
 */

// Variação do dano a cada golpe: dois confrontos iguais nunca saem idênticos.
const DAMAGE_VARIANCE = 0.45;

// Crítico: chance base, ajustada pela vantagem de ATA sobre o defensor.
const CRIT_BASE = 0.12;
const CRIT_PER_ATA = 0.0008;
const CRIT_MIN = 0.07;
const CRIT_MAX = 0.18;
const CRIT_MULTIPLIER = 2.0;

// Esquiva: quem é mais rápido que o atacante desvia mais.
const DODGE_BASE = 0.09;
const DODGE_PER_ATA = 0.0006;
const DODGE_MIN = 0.05;
const DODGE_MAX = 0.14;

// "Modo desespero": encurralado, o personagem luta melhor — clássico de
// anime e, na prática, o que dá chance real de virada para o azarão.
const DESPERATION_THRESHOLD = 0.40;
const DESPERATION_MULTIPLIER = 3.0;
const CRIT_CEILING = 0.60;

// Ordem do turno é probabilística, não absoluta: ter mais ATA aumenta a
// chance de começar atacando, mas não garante.
const ORDER_PER_ATA = 0.002;
const ORDER_MIN = 0.40;
const ORDER_MAX = 0.60;

// Trava de segurança: sem isto, duas cartas com POW 0 entrariam em loop
// infinito e travariam o processo do bot inteiro.
const MAX_TURNS = 50;
const MIN_DAMAGE = 1;

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

/** Chance de crítico do atacante, já considerando o modo desespero. */
function critChance(ataAtacante, ataDefensor, vidaPercentualAtacante = 1) {
    let chance = clamp(CRIT_BASE + (ataAtacante - ataDefensor) * CRIT_PER_ATA, CRIT_MIN, CRIT_MAX);
    if (vidaPercentualAtacante <= DESPERATION_THRESHOLD) {
        chance *= DESPERATION_MULTIPLIER;
    }
    return clamp(chance, 0, CRIT_CEILING);
}

/** Chance de o defensor esquivar do golpe. */
function dodgeChance(ataDefensor, ataAtacante) {
    return clamp(DODGE_BASE + (ataDefensor - ataAtacante) * DODGE_PER_ATA, DODGE_MIN, DODGE_MAX);
}

/** Probabilidade de a carta A começar atacando. */
function firstStrikeChance(ataA, ataB) {
    return clamp(0.5 + (ataA - ataB) * ORDER_PER_ATA, ORDER_MIN, ORDER_MAX);
}

/** Resolve um golpe e devolve o que aconteceu, para conseguirmos narrar. */
function resolveAttack(atacante, defensor, vidaPercentualAtacante, rng) {
    const ataA = atacante.ATA ?? 0;
    const ataD = defensor.ATA ?? 0;
    const pow = atacante.POW ?? 0;

    if (rng() < dodgeChance(ataD, ataA)) {
        return { damage: 0, dodged: true, crit: false, desperate: false };
    }

    const desperate = vidaPercentualAtacante <= DESPERATION_THRESHOLD;
    const variacao = 1 + (rng() * 2 - 1) * DAMAGE_VARIANCE;
    const crit = rng() < critChance(ataA, ataD, vidaPercentualAtacante);
    const bruto = pow * variacao * (crit ? CRIT_MULTIPLIER : 1);

    return {
        damage: Math.max(MIN_DAMAGE, Math.round(bruto)),
        dodged: false,
        crit,
        desperate: desperate && crit
    };
}

/**
 * Descreve um golpe como EVENTO, não como frase pronta.
 *
 * O motor não sabe em que idioma a batalha vai ser mostrada — e nem
 * deveria: o mesmo duelo pode ser exibido em português no canal e em
 * inglês na DM de um dos jogadores. Quem transforma evento em texto é
 * `narrar()`, na hora de montar o embed.
 *
 * Isto também conserta um acoplamento perigoso que existia antes: o
 * handler contava críticos e viradas procurando as palavras "CRÍTICO" e
 * "VIRADA" dentro do log com expressão regular. Traduzir uma única
 * dessas palavras zeraria silenciosamente as conquistas de crítico —
 * sem erro, sem log, só jogadores reclamando que o troféu não desbloqueia.
 * Agora a contagem vem de campos booleanos.
 */
function descreverGolpe(atacante, defensor, resultado, vidaRestante) {
    if (resultado.dodged) {
        return { tipo: 'esquiva', atacante: atacante.name, defensor: defensor.name };
    }
    return {
        tipo: 'golpe',
        atacante: atacante.name,
        defensor: defensor.name,
        dano: resultado.damage,
        vidaRestante: Math.max(0, vidaRestante),
        crit: resultado.crit,
        desperate: resultado.desperate
    };
}

/** Duelo 1v1 entre duas cartas. Retorna vencedor ('A' ou 'B') e o log. */
function runRound(cardA, cardB, roundIndex, rng = Math.random) {
    const maxA = Math.max(1, cardA.LIF ?? 1);
    const maxB = Math.max(1, cardB.LIF ?? 1);
    let lifeA = cardA.LIF ?? 0;
    let lifeB = cardB.LIF ?? 0;
    const log = [];

    let vezDeA = rng() < firstStrikeChance(cardA.ATA ?? 0, cardB.ATA ?? 0);
    log.push({ tipo: 'primeiro', carta: vezDeA ? cardA.name : cardB.name });

    for (let turno = 0; turno < MAX_TURNS; turno++) {
        const atacante = vezDeA ? cardA : cardB;
        const defensor = vezDeA ? cardB : cardA;
        const vidaPercentual = vezDeA ? lifeA / maxA : lifeB / maxB;

        const resultado = resolveAttack(atacante, defensor, vidaPercentual, rng);

        if (vezDeA) lifeB -= resultado.damage;
        else lifeA -= resultado.damage;

        log.push(descreverGolpe(atacante, defensor, resultado, vezDeA ? lifeB : lifeA));

        if (lifeB <= 0) {
            log.push({ tipo: 'venceu', carta: cardA.name });
            return { winner: 'A', loser: 'B', log, lifeA, lifeB: 0 };
        }
        if (lifeA <= 0) {
            log.push({ tipo: 'venceu', carta: cardB.name });
            return { winner: 'B', loser: 'A', log, lifeA: 0, lifeB };
        }

        vezDeA = !vezDeA;
    }

    // Estourou o limite de turnos: decide por percentual de vida restante.
    const percentA = lifeA / maxA;
    const percentB = lifeB / maxB;
    log.push({ tipo: 'tempo' });

    if (percentA === percentB) {
        const vencedor = (cardA.POW ?? 0) >= (cardB.POW ?? 0) ? 'A' : 'B';
        return { winner: vencedor, loser: vencedor === 'A' ? 'B' : 'A', log, lifeA, lifeB };
    }

    const vencedor = percentA > percentB ? 'A' : 'B';
    return { winner: vencedor, loser: vencedor === 'A' ? 'B' : 'A', log, lifeA, lifeB };
}

/**
 * Transforma um evento do log em frase, no idioma pedido.
 * @param {object} evento entrada de `log`
 * @param {function} t tradutor já preso a um idioma
 */
function narrar(evento, t) {
    switch (evento.tipo) {
        case 'primeiro':
            return t('battle.log_primeiro', { carta: evento.carta });
        case 'esquiva':
            return t('battle.log_esquiva', { defensor: evento.defensor, atacante: evento.atacante });
        case 'golpe': {
            const prefixo = evento.desperate
                ? t('battle.log_virada')
                : evento.crit ? t('battle.log_critico') : '';
            return prefixo + t('battle.log_dano', {
                atacante: evento.atacante,
                dano: evento.dano,
                defensor: evento.defensor,
                vida: evento.vidaRestante
            });
        }
        case 'venceu':
            return t('battle.log_venceu', { carta: evento.carta });
        case 'tempo':
            return t('battle.log_tempo');
        default:
            return '';
    }
}

/**
 * Batalha 3v3: três confrontos 1v1, na ordem em que cada jogador escolheu
 * suas cartas. Quem vencer mais confrontos leva a batalha.
 */
function runBattle(deckX, deckY, rng = Math.random) {
    const rounds = [];
    let winsX = 0;
    let winsY = 0;

    // Contagem da luta inteira, para missões e conquistas. Vem daqui (e
    // não de uma varredura de texto no handler) porque o motor é o único
    // lugar que sabe de verdade o que aconteceu.
    let criticos = 0;
    let viradas = 0;

    for (let i = 0; i < 3; i++) {
        const result = runRound(deckX[i], deckY[i], i, rng);
        for (const evento of result.log) {
            if (evento.tipo !== 'golpe') continue;
            if (evento.crit) criticos++;
            if (evento.desperate) viradas++;
        }
        rounds.push({
            round: i + 1,
            cardX: deckX[i].name,
            cardY: deckY[i].name,
            winner: result.winner,
            log: result.log
        });
        if (result.winner === 'A') winsX++;
        else winsY++;
    }

    const winner = winsX > winsY ? 'X' : winsX < winsY ? 'Y' : null;
    return { winner, winsX, winsY, rounds, criticos, viradas };
}

module.exports = {
    runRound,
    runBattle,
    narrar,
    resolveAttack,
    critChance,
    dodgeChance,
    firstStrikeChance,
    MAX_TURNS,
    CRIT_MULTIPLIER,
    DESPERATION_THRESHOLD
};
