/**
 * Quando uma negociação pode ser cancelada, e quando ela morre sozinha.
 *
 * Troca e batalha têm o mesmo problema e ganharam soluções separadas, o
 * que fez as duas envelhecerem diferente. Este arquivo é a regra única.
 *
 * ## Por que o prazo é por fase, e não um só
 *
 * Antes havia um prazo único por objeto: 10 minutos para qualquer troca,
 * contados da criação. Isso trata igual duas situações muito diferentes:
 *
 * - Um **convite não aceito** é lixo em 2 minutos. Quem ia responder já
 *   respondeu. Enquanto ele existe, bloqueia o jogador de abrir outra
 *   negociação — foi o que travou a troca na prática.
 * - Uma **execução** trava em 1 minuto. Transferir cartas leva
 *   milissegundos; se passou disso, o bot caiu no meio.
 *
 * Um prazo único obriga escolher entre limpar rápido demais (matando
 * negociação viva) ou devagar demais (deixando o jogador preso). Por fase,
 * os dois casos ficam certos.
 *
 * ## Por que cancelar não cobra nada
 *
 * A aposta volta inteira para os dois lados. Cobrar de quem cancela
 * parece justo contra quem desiste ao ver o adversário demorar, mas pune
 * muito mais o caso comum — clicar errado, ou o parceiro sumir. O freio
 * contra abuso é o cooldown entre o mesmo par de jogadores, que já existe.
 */

const { traduzir, DEFAULT_LOCALE } = require('./i18n');

const MINUTO = 60 * 1000;

/**
 * Prazos da troca, por fase.
 *
 * `concluida` e `cancelada` não aparecem aqui de propósito: são estados
 * finais e nunca devem ser varridos por tempo.
 */
const PRAZOS_TROCA = {
    aguardando: 2 * MINUTO,    // convite enviado, ninguém aceitou
    montando: 5 * MINUTO,      // escolhendo as cartas
    confirmando: 5 * MINUTO,   // um lado confirmou, esperando o outro
    executando: 1 * MINUTO     // travou no meio da transferência
};

/** Prazos da batalha, por fase. */
const PRAZOS_BATALHA = {
    choosing: 5 * MINUTO,      // escolhendo o time
    fighting: 1 * MINUTO       // travou durante a resolução
};

/** Fases em que ainda dá para desistir. */
const CANCELAVEIS_TROCA = new Set(['aguardando', 'montando', 'confirmando']);
const CANCELAVEIS_BATALHA = new Set(['choosing']);

/**
 * Passou do prazo daquela fase?
 *
 * Fase desconhecida devolve `false` — melhor deixar viva e alguém
 * reclamar do que apagar por engano uma negociação de fase nova que
 * ninguém lembrou de cadastrar aqui.
 */
function expirou(fase, criadaEm, prazos, agora = Date.now()) {
    const prazo = prazos[fase];
    if (!prazo) return false;
    if (!criadaEm) return false;
    return agora - new Date(criadaEm).getTime() >= prazo;
}

/** Quanto falta para expirar, em ms. Zero se já passou ou não expira. */
function tempoRestante(fase, criadaEm, prazos, agora = Date.now()) {
    const prazo = prazos[fase];
    if (!prazo || !criadaEm) return 0;
    const restante = prazo - (agora - new Date(criadaEm).getTime());
    return restante > 0 ? restante : 0;
}

/**
 * O jogador pode cancelar esta troca?
 *
 * @returns {{ok: boolean, motivo?: string}}
 *   NAO_PARTICIPA  — não é um dos dois lados
 *   EXECUTANDO     — as cartas já estão trocando de dono
 *   FINALIZADA     — já concluiu ou já foi cancelada
 */
function podeCancelarTroca(trade, userId) {
    if (!trade) return { ok: false, motivo: 'FINALIZADA' };

    const participa = trade.proponente?.id === userId || trade.alvo?.id === userId;
    if (!participa) return { ok: false, motivo: 'NAO_PARTICIPA' };

    if (trade.fase === 'executando') return { ok: false, motivo: 'EXECUTANDO' };
    if (!CANCELAVEIS_TROCA.has(trade.fase)) return { ok: false, motivo: 'FINALIZADA' };

    return { ok: true };
}

/**
 * O jogador pode cancelar esta batalha?
 *
 * Durante a escolha de cartas, sim, qualquer um dos dois. Depois que a
 * luta começou, não: o resultado já foi calculado e a aposta resolvida —
 * cancelar aí seria desfazer uma derrota.
 */
function podeCancelarBatalha(battle, userId) {
    if (!battle) return { ok: false, motivo: 'FINALIZADA' };

    const participa = battle.userX?.id === userId || battle.userY?.id === userId;
    if (!participa) return { ok: false, motivo: 'NAO_PARTICIPA' };

    if (battle.phase === 'fighting') return { ok: false, motivo: 'EM_COMBATE' };
    if (!CANCELAVEIS_BATALHA.has(battle.phase)) return { ok: false, motivo: 'FINALIZADA' };

    return { ok: true };
}

/**
 * Motivos de recusa que têm texto no dicionário.
 *
 * A lista existe para o teste conseguir conferir que todo motivo devolvido
 * por `podeCancelar*` tem frase nos dois idiomas — sem ela, um motivo novo
 * apareceria na tela como a própria chave.
 */
const MOTIVOS = ['NAO_PARTICIPA', 'EXECUTANDO', 'EM_COMBATE', 'FINALIZADA'];

/** Texto para o jogador, por motivo de recusa, no idioma pedido. */
function mensagem(motivo, locale = DEFAULT_LOCALE) {
    return traduzir(locale, `ciclo_de_vida.${motivo}`);
}

/**
 * Monta o filtro do Mongo que encontra registros vencidos.
 *
 * Um `$or` só, com uma condição por fase, em vez de uma consulta por fase
 * — a varredura roda a cada 5 minutos e não precisa virar N idas ao banco.
 *
 * O nome do campo da fase é parâmetro porque a troca usa `fase` (em
 * português) e a batalha usa `phase`. Unificar os dois no schema seria o
 * certo, mas é migração de dado em produção.
 *
 * @param {object} prazos      mapa fase -> milissegundos
 * @param {string} campoFase   'fase' ou 'phase'
 * @param {string} campoData   'criadaEm' ou 'createdAt'
 */
function filtroExpirados(prazos, campoFase, campoData, agora = Date.now()) {
    return {
        $or: Object.entries(prazos).map(([fase, prazo]) => ({
            [campoFase]: fase,
            [campoData]: { $lt: new Date(agora - prazo) }
        }))
    };
}

module.exports = {
    MINUTO,
    PRAZOS_TROCA,
    PRAZOS_BATALHA,
    CANCELAVEIS_TROCA,
    CANCELAVEIS_BATALHA,
    expirou,
    tempoRestante,
    podeCancelarTroca,
    podeCancelarBatalha,
    filtroExpirados,
    MOTIVOS,
    mensagem
};
