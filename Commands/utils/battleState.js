const { Battle, BattleCooldown } = require('./battleSchema');
const { addBalance } = require('./economy');

/**
 * Estado das batalhas, persistido no MongoDB.
 *
 * Toda função aqui é assíncrona — o estado não está mais na memória do
 * processo. Isso é o que permite o bot reiniciar no meio de um duelo sem
 * fazer as apostas retidas sumirem.
 */

// Cooldown entre batalhas do mesmo par de jogadores. Sem isso, dois amigos
// (ou duas contas do mesmo dono) conseguem duelar em loop e farmar moeda.
const BATTLE_COOLDOWN_MS = Number(process.env.BATTLE_COOLDOWN_MS) > 0
    ? Number(process.env.BATTLE_COOLDOWN_MS)
    : 60 * 1000;

// Depois disso, uma batalha parada é considerada abandonada: as apostas
// voltam para os jogadores e o registro é apagado.
const BATTLE_TTL_MS = Number(process.env.BATTLE_TTL_MS) > 0
    ? Number(process.env.BATTLE_TTL_MS)
    : 30 * 60 * 1000;

function generateBattleId() {
    return 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function chaveDoPar(idA, idB) {
    return [idA, idB].sort().join(':');
}

/** Devolve as apostas de uma batalha, se ainda estiverem retidas. */
async function refundBattle(battle) {
    if (!battle || !battle.wagerHeld || !(battle.wager > 0)) return false;

    await addBalance(battle.userX.id, battle.wager);
    await addBalance(battle.userY.id, battle.wager);
    // Marca antes de apagar para não devolver duas vezes se algo falhar
    // no meio do caminho.
    await Battle.updateOne({ _id: battle._id }, { wagerHeld: false });
    return true;
}

/**
 * Roda no boot do bot: qualquer batalha que tenha sobrado de uma execução
 * anterior é cancelada e as apostas voltam para os jogadores.
 * Devolve um resumo para o log.
 */
async function recoverPendingBattles() {
    const pendentes = await Battle.find({}).lean();
    if (pendentes.length === 0) return { canceladas: 0, devolvido: 0 };

    let devolvido = 0;
    for (const battle of pendentes) {
        if (battle.wagerHeld && battle.wager > 0) {
            await addBalance(battle.userX.id, battle.wager);
            await addBalance(battle.userY.id, battle.wager);
            devolvido += battle.wager * 2;
        }
    }

    await Battle.deleteMany({ _id: { $in: pendentes.map((b) => b._id) } });
    return { canceladas: pendentes.length, devolvido };
}

/** Cancela batalhas abandonadas (jogador nunca terminou de escolher). */
async function sweepStaleBattles() {
    const limite = new Date(Date.now() - BATTLE_TTL_MS);
    const velhas = await Battle.find({ createdAt: { $lt: limite } }).lean();
    if (velhas.length === 0) return { canceladas: 0, devolvido: 0 };

    let devolvido = 0;
    for (const battle of velhas) {
        if (battle.wagerHeld && battle.wager > 0) {
            await addBalance(battle.userX.id, battle.wager);
            await addBalance(battle.userY.id, battle.wager);
            devolvido += battle.wager * 2;
        }
    }

    await Battle.deleteMany({ _id: { $in: velhas.map((b) => b._id) } });
    return { canceladas: velhas.length, devolvido };
}

/** Quanto falta do cooldown entre esses dois jogadores (0 = liberado). */
async function cooldownRestante(idA, idB) {
    const registro = await BattleCooldown.findOne({ pairKey: chaveDoPar(idA, idB) }).lean();
    if (!registro) return 0;
    const passou = Date.now() - new Date(registro.lastAt).getTime();
    return passou >= BATTLE_COOLDOWN_MS ? 0 : BATTLE_COOLDOWN_MS - passou;
}

async function registrarDuelo(idA, idB) {
    await BattleCooldown.findOneAndUpdate(
        { pairKey: chaveDoPar(idA, idB) },
        { lastAt: new Date() },
        { upsert: true }
    );
}

/** Já existe uma batalha em andamento envolvendo esse jogador? */
async function temBatalhaAtiva(userId) {
    const existe = await Battle.exists({
        $or: [{ 'userX.id': userId }, { 'userY.id': userId }]
    });
    return Boolean(existe);
}

async function createBattle(battleId, userX, userY, challengeChannelId, wager = 0) {
    const battle = await Battle.create({
        battleId: String(battleId),
        userX: { id: userX.id, username: userX.username },
        userY: { id: userY.id, username: userY.username },
        wager,
        wagerHeld: wager > 0,
        challengeChannelId,
        deckX: [],
        deckY: [],
        selectedIdsX: [],
        selectedIdsY: [],
        phase: 'choosing'
    });
    return battle;
}

async function getBattle(battleId) {
    return Battle.findOne({ battleId: String(battleId) });
}

/** Encontra batalha ativa em que o usuário é jogador (fallback). */
async function getBattleByUserId(userId) {
    return Battle.findOne({
        phase: 'choosing',
        $or: [{ 'userX.id': userId }, { 'userY.id': userId }]
    });
}

/**
 * Adiciona uma carta ao deck de forma atômica.
 *
 * A condição `deckX.2: { $exists: false }` garante que nunca entre uma
 * quarta carta, mesmo com dois cliques quase simultâneos — o Mongo resolve
 * a corrida, não o código.
 */
async function addCardToDeck(battleId, side, card) {
    const deckField = side === 'X' ? 'deckX' : 'deckY';
    const idsField = side === 'X' ? 'selectedIdsX' : 'selectedIdsY';
    const cardId = String(card._id);

    const snapshot = {
        _id: card._id,
        name: card.name,
        series: card.series,
        rarity: card.rarity,
        overall: card.overall ?? 0,
        ATA: card.ATA ?? 0,
        LIF: card.LIF ?? 0,
        POW: card.POW ?? 0
    };

    return Battle.findOneAndUpdate(
        {
            battleId: String(battleId),
            phase: 'choosing',
            [`${deckField}.2`]: { $exists: false },
            [idsField]: { $ne: cardId }
        },
        {
            $push: { [deckField]: snapshot },
            $addToSet: { [idsField]: cardId }
        },
        { new: true }
    );
}

function bothDecksReady(battle) {
    return battle && battle.deckX.length === 3 && battle.deckY.length === 3;
}

/** Marca a batalha como em resolução. Só um chamador consegue — evita
 * que dois cliques simultâneos resolvam (e paguem) a mesma batalha duas vezes. */
async function claimForResolution(battleId) {
    return Battle.findOneAndUpdate(
        { battleId: String(battleId), phase: 'choosing' },
        { phase: 'fighting' },
        { new: true }
    );
}

async function setMessageRefs(battleId, side, messageId, channelId) {
    const campos = side === 'X'
        ? { messageXId: messageId, channelXId: channelId }
        : { messageYId: messageId, channelYId: channelId };
    return Battle.findOneAndUpdate({ battleId: String(battleId) }, campos, { new: true });
}

/** Encerra a batalha: registra o cooldown do par e apaga o registro. */
async function finishBattle(battleId) {
    const battle = await Battle.findOne({ battleId: String(battleId) }).lean();
    if (battle) {
        await registrarDuelo(battle.userX.id, battle.userY.id);
    }
    await Battle.deleteOne({ battleId: String(battleId) });
}

/** Cancela uma batalha devolvendo as apostas. */
async function cancelBattle(battleId) {
    const battle = await Battle.findOne({ battleId: String(battleId) });
    if (!battle) return null;
    await refundBattle(battle);
    await Battle.deleteOne({ _id: battle._id });
    return battle;
}

/** Marca que as apostas já foram pagas ao vencedor (não devolver depois). */
async function releaseWager(battleId) {
    return Battle.updateOne({ battleId: String(battleId) }, { wagerHeld: false });
}

module.exports = {
    generateBattleId,
    createBattle,
    getBattle,
    getBattleByUserId,
    addCardToDeck,
    bothDecksReady,
    claimForResolution,
    setMessageRefs,
    finishBattle,
    cancelBattle,
    releaseWager,
    refundBattle,
    recoverPendingBattles,
    sweepStaleBattles,
    temBatalhaAtiva,
    cooldownRestante,
    registrarDuelo,
    BATTLE_COOLDOWN_MS,
    BATTLE_TTL_MS
};
