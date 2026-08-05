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

/**
 * Filtro de catálogo para cada Pokédex.
 *
 * ## Por que duas Pokédex, e não uma com filtro na tela
 *
 * A dex normal existe para ser COMPLETADA — a barra de progresso é a
 * promessa. Se as cartas de evento entrassem nela, a barra de todo mundo
 * cairia toda vez que você distribuísse uma carta nova, e ninguém nunca
 * mais fecharia 100%: quem não estava no evento não tem como conseguir.
 *
 * Separando, cada uma mede o que dá para medir. A dex normal continua
 * fechável; a de evento é um mural do que você participou.
 */
const FILTROS = {
    normal: { rarity: { $ne: 'event' } },
    evento: { rarity: 'event' }
};

function filtroDaDex(dex = 'normal') {
    return FILTROS[dex] || FILTROS.normal;
}

/**
 * Quantas cartas o jogador descobriu e quantas existem no total.
 *
 * @param {string} userId
 * @param {'normal'|'evento'} dex qual Pokédex
 */
async function getProgress(userId, dex = 'normal') {
    const filtro = filtroDaDex(dex);

    const [user, totalCatalogo] = await Promise.all([
        User.findOne({ id: userId }).select('discovered').lean(),
        Card.countDocuments(filtro)
    ]);

    const ids = (user?.discovered || []).map((d) => d.cardId).filter(Boolean);

    // A contagem precisa passar pelo catálogo: o `discovered` do jogador
    // guarda as duas dex misturadas, e contar o array inteiro daria o
    // total errado nas duas.
    const descobertas = ids.length > 0
        ? await Card.countDocuments({ ...filtro, _id: { $in: ids } })
        : 0;

    const percentual = totalCatalogo > 0 ? (descobertas / totalCatalogo) * 100 : 0;

    return { descobertas, total: totalCatalogo, percentual, dex };
}

/** Set com os ids (em string) das cartas já descobertas pelo jogador. */
async function getDiscoveredSet(userId) {
    const user = await User.findOne({ id: userId }).select('discovered').lean();
    return new Set((user?.discovered || []).map((d) => String(d.cardId)));
}

/** Progresso por raridade, para a tela da Pokédex. */
async function getProgressByRarity(userId, dex = 'normal') {
    const filtro = filtroDaDex(dex);

    const [descobertoSet, totaisPorRaridade] = await Promise.all([
        getDiscoveredSet(userId),
        Card.aggregate([{ $match: filtro }, { $group: { _id: '$rarity', total: { $sum: 1 } } }])
    ]);

    if (descobertoSet.size === 0) {
        return totaisPorRaridade.map((r) => ({ rarity: r._id, descobertas: 0, total: r.total }));
    }

    const ids = [...descobertoSet];
    const descobertasPorRaridade = await Card.aggregate([
        {
            $match: {
                ...filtro,
                _id: { $in: ids.map((id) => new (require('mongoose').Types.ObjectId)(id)) }
            }
        },
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
    FILTROS,
    filtroDaDex,
    registerDiscovery,
    getProgress,
    getDiscoveredSet,
    getProgressByRarity
};
