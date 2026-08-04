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

function descreverGolpe(atacante, defensor, resultado, vidaRestante) {
    if (resultado.dodged) {
        return `💨 **${defensor.name}** esquivou do ataque de **${atacante.name}**!`;
    }
    let prefixo = '';
    if (resultado.desperate) prefixo = '🔥 **VIRADA!** ';
    else if (resultado.crit) prefixo = '💥 **CRÍTICO!** ';
    return `${prefixo}**${atacante.name}** causou **${resultado.damage}** de dano — **${defensor.name}** ficou com **${Math.max(0, vidaRestante)}** de vida.`;
}

/** Duelo 1v1 entre duas cartas. Retorna vencedor ('A' ou 'B') e o log. */
function runRound(cardA, cardB, roundIndex, rng = Math.random) {
    const maxA = Math.max(1, cardA.LIF ?? 1);
    const maxB = Math.max(1, cardB.LIF ?? 1);
    let lifeA = cardA.LIF ?? 0;
    let lifeB = cardB.LIF ?? 0;
    const log = [];

    // Eventos estruturados, para a transmissão ao vivo.
    //
    // O `log` continua sendo texto puro (vários lugares dependem dele),
    // mas texto não dá para desenhar barra de vida nem cronometrar. Cada
    // evento carrega a vida dos dois LADOS no instante em que aconteceu —
    // é isso que permite reproduzir a luta golpe a golpe depois, sem
    // recalcular nada e sem risco de a animação divergir do resultado.
    const eventos = [];
    const registrar = (tipo, extra = {}) => {
        eventos.push({
            tipo,
            round: roundIndex + 1,
            vidaA: Math.max(0, lifeA),
            vidaB: Math.max(0, lifeB),
            maxA,
            maxB,
            ...extra
        });
    };

    let vezDeA = rng() < firstStrikeChance(cardA.ATA ?? 0, cardB.ATA ?? 0);
    const abertura = `⚡ **${vezDeA ? cardA.name : cardB.name}** foi mais rápido e atacou primeiro.`;
    log.push(abertura);
    registrar('inicio', { texto: abertura, primeiro: vezDeA ? 'A' : 'B' });

    for (let turno = 0; turno < MAX_TURNS; turno++) {
        const atacante = vezDeA ? cardA : cardB;
        const defensor = vezDeA ? cardB : cardA;
        const vidaPercentual = vezDeA ? lifeA / maxA : lifeB / maxB;

        const resultado = resolveAttack(atacante, defensor, vidaPercentual, rng);

        if (vezDeA) lifeB -= resultado.damage;
        else lifeA -= resultado.damage;

        const texto = descreverGolpe(atacante, defensor, resultado, vezDeA ? lifeB : lifeA);
        log.push(texto);
        registrar(resultado.dodged ? 'esquiva' : 'golpe', {
            texto,
            lado: vezDeA ? 'A' : 'B',
            dano: resultado.damage,
            crit: resultado.crit,
            desperate: resultado.desperate
        });

        if (lifeB <= 0) {
            const fim = `🏆 **${cardA.name}** venceu o confronto!`;
            log.push(fim);
            lifeB = 0;
            registrar('fim', { texto: fim, vencedor: 'A' });
            return { winner: 'A', loser: 'B', log, eventos, lifeA, lifeB: 0 };
        }
        if (lifeA <= 0) {
            const fim = `🏆 **${cardB.name}** venceu o confronto!`;
            log.push(fim);
            lifeA = 0;
            registrar('fim', { texto: fim, vencedor: 'B' });
            return { winner: 'B', loser: 'A', log, eventos, lifeA: 0, lifeB };
        }

        vezDeA = !vezDeA;
    }

    // Estourou o limite de turnos: decide por percentual de vida restante.
    const percentA = lifeA / maxA;
    const percentB = lifeB / maxB;
    const porTempo = '⏱️ O confronto se estendeu — vence quem está em melhor estado.';
    log.push(porTempo);

    const vencedor = percentA === percentB
        ? ((cardA.POW ?? 0) >= (cardB.POW ?? 0) ? 'A' : 'B')
        : (percentA > percentB ? 'A' : 'B');

    registrar('tempo', { texto: porTempo, vencedor });

    return { winner: vencedor, loser: vencedor === 'A' ? 'B' : 'A', log, eventos, lifeA, lifeB };
}

/**
 * Batalha 3v3: três confrontos 1v1, na ordem em que cada jogador escolheu
 * suas cartas. Quem vencer mais confrontos leva a batalha.
 *
 * Não existe empate: `runRound` sempre devolve um vencedor (até o estouro
 * do limite de turnos é desempatado por vida restante e, se preciso, por
 * POW), e três confrontos só podem terminar 2-1 ou 3-0. Portanto `winner`
 * é sempre 'X' ou 'Y' — quem chama não precisa tratar nulo.
 */
function runBattle(deckX, deckY, rng = Math.random) {
    const rounds = [];
    let winsX = 0;
    let winsY = 0;

    for (let i = 0; i < 3; i++) {
        const result = runRound(deckX[i], deckY[i], i, rng);
        rounds.push({
            round: i + 1,
            cardX: deckX[i].name,
            cardY: deckY[i].name,
            winner: result.winner,
            log: result.log,
            // A transmissão ao vivo lê daqui. Os nomes vão junto porque o
            // evento sozinho só sabe dizer 'A' ou 'B'.
            eventos: result.eventos,
            nomeA: deckX[i].name,
            nomeB: deckY[i].name,
            raridadeA: deckX[i].rarity,
            raridadeB: deckY[i].rarity
        });
        if (result.winner === 'A') winsX++;
        else winsY++;
    }

    return { winner: winsX > winsY ? 'X' : 'Y', winsX, winsY, rounds };
}

module.exports = {
    runRound,
    runBattle,
    resolveAttack,
    critChance,
    dodgeChance,
    firstStrikeChance,
    MAX_TURNS,
    CRIT_MULTIPLIER,
    DESPERATION_THRESHOLD
};
