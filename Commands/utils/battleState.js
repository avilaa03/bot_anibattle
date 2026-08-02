/**
 * Estado das batalhas em andamento.
 *
 * Fica em memória do processo: se o bot reiniciar, as batalhas em curso se
 * perdem (e as apostas precisam ser devolvidas — ver refundAllPending).
 * Migrar isso para Redis/Mongo é um item do roadmap.
 */
const activeBattles = new Map();

// Cooldown entre batalhas do mesmo par de jogadores. Sem isso, dois amigos
// (ou duas contas do mesmo dono) conseguem duelar em loop e farmar moeda.
const BATTLE_COOLDOWN_MS = Number(process.env.BATTLE_COOLDOWN_MS) > 0
    ? Number(process.env.BATTLE_COOLDOWN_MS)
    : 60 * 1000;

const ultimoDueloPorPar = new Map();

/** Gera um ID único curto para a batalha. */
function generateBattleId() {
    return 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function chaveDoPar(idA, idB) {
    return [idA, idB].sort().join(':');
}

/** Quanto falta do cooldown entre esses dois jogadores (0 = liberado). */
function cooldownRestante(idA, idB) {
    const ultimo = ultimoDueloPorPar.get(chaveDoPar(idA, idB));
    if (!ultimo) return 0;
    const passou = Date.now() - ultimo;
    return passou >= BATTLE_COOLDOWN_MS ? 0 : BATTLE_COOLDOWN_MS - passou;
}

function registrarDuelo(idA, idB) {
    ultimoDueloPorPar.set(chaveDoPar(idA, idB), Date.now());
}

/** Já existe uma batalha em andamento envolvendo esse jogador? */
function temBatalhaAtiva(userId) {
    for (const state of activeBattles.values()) {
        if (state.userX.id === userId || state.userY.id === userId) return true;
    }
    return false;
}

function createBattle(battleId, userX, userY, userXData, userYData, challengeChannelId, wager = 0) {
    const key = String(battleId);
    const state = {
        battleId: key,
        userX,
        userY,
        userXData,
        userYData,
        challengeChannelId,
        wager,
        // Guardamos o _id da carta escolhida (não só o índice), para
        // conseguirmos revalidar a posse no banco antes de resolver.
        deckX: [],
        deckY: [],
        selectedIdsX: new Set(),
        selectedIdsY: new Set(),
        messageXId: null,
        channelXId: null,
        messageYId: null,
        channelYId: null,
        phase: 'choosing',
        criadoEm: Date.now()
    };
    activeBattles.set(key, state);
    return state;
}

function getBattle(battleId) {
    return activeBattles.get(String(battleId));
}

/** Encontra batalha ativa em que o usuário é jogador (fallback). */
function getBattleByUserId(userId) {
    for (const state of activeBattles.values()) {
        if (state.phase === 'choosing' && (state.userX.id === userId || state.userY.id === userId)) {
            return state;
        }
    }
    return null;
}

function addCardToDeck(battleId, side, card) {
    const state = activeBattles.get(String(battleId));
    if (!state || state.phase !== 'choosing') return false;
    const deck = side === 'X' ? state.deckX : state.deckY;
    if (deck.length >= 3) return false;
    deck.push(card);
    return true;
}

function isDeckComplete(state, side) {
    const deck = side === 'X' ? state.deckX : state.deckY;
    return deck.length === 3;
}

function bothDecksReady(state) {
    return state.deckX.length === 3 && state.deckY.length === 3;
}

function finishBattle(battleId) {
    const state = activeBattles.get(String(battleId));
    if (state) {
        registrarDuelo(state.userX.id, state.userY.id);
    }
    activeBattles.delete(String(battleId));
}

/** Lista batalhas pendentes — usado para devolver apostas em caso de erro. */
function listPending() {
    return [...activeBattles.values()];
}

module.exports = {
    activeBattles,
    generateBattleId,
    createBattle,
    getBattle,
    getBattleByUserId,
    addCardToDeck,
    isDeckComplete,
    bothDecksReady,
    finishBattle,
    listPending,
    temBatalhaAtiva,
    cooldownRestante,
    registrarDuelo,
    BATTLE_COOLDOWN_MS
};
