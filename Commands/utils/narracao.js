const ui = require('./embeds');

/**
 * Transforma o resultado de uma batalha em quadros para transmitir ao vivo.
 *
 * ## A decisão que estrutura tudo
 *
 * A luta é calculada inteira ANTES de qualquer coisa aparecer na tela, e o
 * resultado é gravado no banco antes da animação começar. Este arquivo só
 * reencena o que já aconteceu.
 *
 * Parece um detalhe, mas é o que impede a pior falha possível: se o bot
 * cair no meio da transmissão, o resultado já está fechado, a aposta já
 * foi resolvida e ninguém perde moeda. Se a luta fosse calculada conforme
 * a animação avança, uma queda no meio deixaria dois jogadores com a
 * aposta retida e nenhum vencedor.
 *
 * A animação é enfeite sobre um fato consumado. Nunca a fonte da verdade.
 *
 * ## Por que os quadros são agrupados
 *
 * O Discord limita edições de mensagem por canal. Uma luta pode ter 40
 * golpes; editar 40 vezes tomaria rate limit e demoraria minutos. Os
 * eventos são agrupados em no máximo `MAX_QUADROS` quadros, dando uma
 * luta de 30 a 45 segundos — perto do ritmo do DreamTeam.
 */

/** Quantos quadros no máximo, contando o inicial e o final. */
const MAX_QUADROS = 14;

/** Intervalo entre quadros. Abaixo de 2s começa a esbarrar em rate limit. */
const INTERVALO_MS = 2500;

/** Quantas linhas de narração cada quadro mostra. */
const LINHAS_POR_QUADRO = 4;

const BARRA_TAMANHO = 12;

/** Barra de vida em blocos. */
function barra(atual, maximo) {
    const proporcao = maximo > 0 ? Math.max(0, Math.min(1, atual / maximo)) : 0;
    const cheios = Math.round(proporcao * BARRA_TAMANHO);
    const cor = proporcao > 0.5 ? '🟩' : proporcao > 0.25 ? '🟨' : '🟥';
    return cor.repeat(cheios) + '⬛'.repeat(BARRA_TAMANHO - cheios);
}

/**
 * Junta os eventos de todos os rounds numa linha do tempo só.
 *
 * A batalha são três confrontos independentes; para transmitir, o que
 * importa é a sequência contínua do que o espectador vê.
 */
function linhaDoTempo(rounds) {
    const tudo = [];
    for (const round of rounds) {
        for (const evento of round.eventos || []) {
            tudo.push({ ...evento, round: round.round, nomeA: round.nomeA, nomeB: round.nomeB });
        }
    }
    return tudo;
}

/**
 * Distribui os eventos em quadros.
 *
 * Sempre termina no último evento — o quadro final precisa mostrar o
 * desfecho, não parar no meio de uma troca de golpes.
 */
function agruparEmQuadros(eventos, maxQuadros = MAX_QUADROS) {
    if (eventos.length === 0) return [];
    if (eventos.length <= maxQuadros) return eventos.map((_, i) => i);

    // Índices do último evento de cada quadro, distribuídos por igual.
    const cortes = [];
    for (let i = 1; i <= maxQuadros; i++) {
        cortes.push(Math.ceil((eventos.length * i) / maxQuadros) - 1);
    }
    // Remove repetições que aparecem quando há mais quadros que eventos.
    return [...new Set(cortes)];
}

/** Emoji do placar de cada round já decidido. */
function placarDosRounds(rounds, ateRound) {
    return rounds.map((r) => {
        if (r.round > ateRound) return '⬜';
        if (r.round === ateRound) return '⚔️';
        return r.winner === 'A' ? '🟦' : '🟥';
    }).join(' ');
}

/**
 * Monta o embed de um instante da luta.
 *
 * @param {object} dados
 * @param {string} dados.nomeX  nome do jogador X
 * @param {string} dados.nomeY  nome do jogador Y
 * @param {Array}  dados.rounds rounds vindos do runBattle
 * @param {Array}  dados.eventos linha do tempo completa
 * @param {number} dados.ate    índice do último evento a mostrar
 */
function montarQuadro({ nomeX, nomeY, rounds, eventos, ate, wager = 0 }) {
    const atual = eventos[ate];
    const round = rounds.find((r) => r.round === atual.round) || rounds[0];

    // Quantos rounds já terminaram antes deste.
    const decididos = rounds.filter((r) => r.round < atual.round);
    const vitoriasX = decididos.filter((r) => r.winner === 'A').length;
    const vitoriasY = decididos.filter((r) => r.winner === 'B').length;

    const embed = ui.base(ui.STATUS_COLORS.warning)
        .setTitle(`⚔️ ${nomeX}  ${vitoriasX} — ${vitoriasY}  ${nomeY}`)
        .setDescription(
            `**Round ${atual.round}** de ${rounds.length}   ${placarDosRounds(rounds, atual.round)}\n\n`
            + `${ui.getRarity(round.raridadeA).emoji} **${ui.cardName(round.nomeA, round.nivelA)}**\n`
            + `${barra(atual.vidaA, atual.maxA)}  \`${atual.vidaA}/${atual.maxA}\`\n\n`
            + `${ui.getRarity(round.raridadeB).emoji} **${ui.cardName(round.nomeB, round.nivelB)}**\n`
            + `${barra(atual.vidaB, atual.maxB)}  \`${atual.vidaB}/${atual.maxB}\``
        );

    // As últimas linhas de narração, para dar noção do que acabou de rolar.
    const inicio = Math.max(0, ate - LINHAS_POR_QUADRO + 1);
    const narracao = eventos.slice(inicio, ate + 1).map((e) => e.texto).join('\n');

    embed.addFields({ name: 'O que está acontecendo', value: narracao.slice(0, 1024), inline: false });

    if (wager > 0) {
        embed.setFooter({ text: `${ui.BRAND} • Valendo ${wager * 2} moedas` });
    } else {
        embed.setFooter({ text: `${ui.BRAND} • Duelo amistoso` });
    }

    return embed;
}

/**
 * Roteiro completo da transmissão.
 *
 * Devolve a lista de embeds, na ordem, e o intervalo entre eles. Quem
 * chama só precisa editar a mensagem a cada `intervaloMs`.
 */
function montarRoteiro({ nomeX, nomeY, resultado, wager = 0, maxQuadros = MAX_QUADROS }) {
    const eventos = linhaDoTempo(resultado.rounds);
    const indices = agruparEmQuadros(eventos, maxQuadros);

    const quadros = indices.map((ate) =>
        montarQuadro({ nomeX, nomeY, rounds: resultado.rounds, eventos, ate, wager })
    );

    return {
        quadros,
        intervaloMs: INTERVALO_MS,
        duracaoEstimadaMs: quadros.length * INTERVALO_MS,
        totalEventos: eventos.length
    };
}

module.exports = {
    MAX_QUADROS,
    INTERVALO_MS,
    LINHAS_POR_QUADRO,
    BARRA_TAMANHO,
    barra,
    linhaDoTempo,
    agruparEmQuadros,
    placarDosRounds,
    montarQuadro,
    montarRoteiro
};
