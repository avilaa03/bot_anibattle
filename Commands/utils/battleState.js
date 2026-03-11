/**
 * Estado ativo das batalhas. battleId = id único gerado por nós (não depende do Discord).
 */
const activeBattles = new Map();

const COIN_WINNER = 50;
const COIN_LOSER = 10;

/** Gera um ID único curto para a batalha (evita depender do id da mensagem do Discord). */
function generateBattleId() {
    return 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function createBattle(battleId, userX, userY, userXData, userYData, challengeChannelId) {
    const key = String(battleId);
    const state = {
        battleId: key,
        userX,
        userY,
        userXData,
        userYData,
        challengeChannelId,
        deckX: [],
        deckY: [],
        selectedIndicesX: new Set(),
        selectedIndicesY: new Set(),
        messageXId: null,
        channelXId: null,
        messageYId: null,
        channelYId: null,
        phase: 'choosing'
    };
    activeBattles.set(key, state);
    return state;
}

function getBattle(battleId) {
    return activeBattles.get(String(battleId));
}

/** Encontra batalha ativa em que o usuário é jogador (fallback se o id do botão não bater). */
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
    activeBattles.delete(String(battleId));
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
    COIN_WINNER,
    COIN_LOSER
};
