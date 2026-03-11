/**
 * Estado ativo das batalhas. battleId = id da mensagem do desafio (challengeMessage.id).
 */
const activeBattles = new Map();

const COIN_WINNER = 50;
const COIN_LOSER = 10;

function createBattle(battleId, userX, userY, userXData, userYData, challengeChannelId) {
    const state = {
        battleId,
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
    activeBattles.set(battleId, state);
    return state;
}

function getBattle(battleId) {
    return activeBattles.get(battleId);
}

function addCardToDeck(battleId, side, card) {
    const state = activeBattles.get(battleId);
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
    activeBattles.delete(battleId);
}

module.exports = {
    activeBattles,
    createBattle,
    getBattle,
    addCardToDeck,
    isDeckComplete,
    bothDecksReady,
    finishBattle,
    COIN_WINNER,
    COIN_LOSER
};
