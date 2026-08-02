const User = require('./userSchema');
const Card = require('./cardSchema');

/**
 * Pokédex do AniBattle.
 *
 * Regra: assim que uma carta entra no inventário do jogador, ela fica
 * registrada como "descoberta" para sempre. Vender, negociar ou perder a
 * carta não apaga o registro — exatamente como a Pokédex de Pokémon, que
 * guarda o que você já viu mesmo depois de soltar o bicho.
 */

/**
 * Marca uma carta do catálogo como descoberta pelo jogador.
 * Usa $addToSet para nunca duplicar, e não faz nada se a carta já estava lá.
 *
 * @param {string} userId id do usuário no Discord
 * @param {ObjectId|string} catalogCardId _id da carta na coleção new-cards
 * @returns {Promise<boolean>} true se foi a PRIMEIRA vez que ele descobriu
 */
async function registerDiscovery(userId, catalogCardId) {
    if (!userId || !catalogCardId) return false;

    const resultado = await User.updateOne(
        { id: userId, 'discovered.cardId': { $ne: catalogCardId } },
        {
            $addToSet: {
                discovered: { cardId: catalogCardId, firstObtainedAt: new Date() }
            }
        },
        { upsert: false }
    );

    // modifiedCount > 0 significa que o registro não existia e foi criado
    // agora, ou seja: descoberta inédita para esse jogador.
    return (resultado.modifiedCount || resultado.nModified || 0) > 0;
}

/** Quantas cartas o jogador descobriu e quantas existem no total. */
async function getProgress(userId) {
    const [user, totalCatalogo] = await Promise.all([
        User.findOne({ id: userId }).select('discovered').lean(),
        Card.countDocuments()
    ]);

    const descobertas = user?.discovered?.length || 0;
    const percentual = totalCatalogo > 0 ? (descobertas / totalCatalogo) * 100 : 0;

    return { descobertas, total: totalCatalogo, percentual };
}

/** Set com os ids (em string) das cartas já descobertas pelo jogador. */
async function getDiscoveredSet(userId) {
    const user = await User.findOne({ id: userId }).select('discovered').lean();
    return new Set((user?.discovered || []).map((d) => String(d.cardId)));
}

/** Progresso por raridade, para a tela da Pokédex. */
async function getProgressByRarity(userId) {
    const [descobertoSet, totaisPorRaridade] = await Promise.all([
        getDiscoveredSet(userId),
        Card.aggregate([{ $group: { _id: '$rarity', total: { $sum: 1 } } }])
    ]);

    if (descobertoSet.size === 0) {
        return totaisPorRaridade.map((r) => ({ rarity: r._id, descobertas: 0, total: r.total }));
    }

    const ids = [...descobertoSet];
    const descobertasPorRaridade = await Card.aggregate([
        { $match: { _id: { $in: ids.map((id) => new (require('mongoose').Types.ObjectId)(id)) } } },
        { $group: { _id: '$rarity', total: { $sum: 1 } } }
    ]);

    const mapaDescobertas = Object.fromEntries(descobertasPorRaridade.map((r) => [r._id, r.total]));

    return totaisPorRaridade.map((r) => ({
        rarity: r._id,
        descobertas: mapaDescobertas[r._id] || 0,
        total: r.total
    }));
}

module.exports = {
    registerDiscovery,
    getProgress,
    getDiscoveredSet,
    getProgressByRarity
};
