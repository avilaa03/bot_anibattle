const User = require('./userSchema');
const { getPerks } = require('./vip');

/**
 * Lista de desejos.
 *
 * Quando alguém rola uma carta que está na sua lista, você é avisado.
 * É o que traz o jogador de volta ao Discord sem custo de divulgação —
 * e o que faz o `/roll` dos outros virar um evento social em vez de uma
 * mensagem que ninguém lê.
 *
 * Aqui o aviso é só isso: um aviso. Quem rolou continua com prioridade
 * total sobre a carta. A ideia é criar conversa e movimentar o mercado
 * ("te dou 5 mil nessa"), não criar disputa por clique.
 */

// Limite por jogador. VIP leva mais — é conveniência, não poder.
const LIMITE_BASE = 10;
const LIMITE_VIP = { bronze: 15, prata: 20, ouro: 30, master: 50 };

function limiteDe(user) {
    const perks = getPerks(user);
    if (!perks.vip) return LIMITE_BASE;
    return LIMITE_VIP[perks.tier.key] || LIMITE_BASE;
}

/** Já está na lista? */
function contem(user, cardId) {
    return (user.wishlist || []).some((w) => String(w.cardId) === String(cardId));
}

/**
 * Adiciona uma carta à lista.
 * @returns {Promise<{ok: boolean, motivo?: string, total?: number, limite?: number}>}
 */
async function adicionar(userId, cardId) {
    const user = await User.findOne({ id: userId }).lean();
    if (!user) return { ok: false, motivo: 'SEM_PERFIL' };

    if (contem(user, cardId)) return { ok: false, motivo: 'JA_TEM' };

    const limite = limiteDe(user);
    const total = (user.wishlist || []).length;
    if (total >= limite) return { ok: false, motivo: 'LIMITE', total, limite };

    await User.updateOne(
        { id: userId },
        { $push: { wishlist: { cardId, adicionadaEm: new Date() } } }
    );

    return { ok: true, total: total + 1, limite };
}

/** Remove uma carta da lista. */
async function remover(userId, cardId) {
    const resultado = await User.updateOne(
        { id: userId },
        { $pull: { wishlist: { cardId } } }
    );
    return (resultado.modifiedCount || 0) > 0;
}

/** Ids (string) das cartas desejadas pelo jogador. */
async function listar(userId) {
    const user = await User.findOne({ id: userId }).select('wishlist').lean();
    return (user?.wishlist || []).map((w) => ({
        cardId: w.cardId,
        adicionadaEm: w.adicionadaEm
    }));
}

/**
 * Quem deseja esta carta, tirando quem rolou.
 * Limita a quantidade para não virar spam de menção.
 *
 * @returns {Promise<string[]>} ids de usuários do Discord
 */
async function quemDeseja(cardId, excluirUserId = null, limite = 8) {
    const filtro = { 'wishlist.cardId': cardId };
    if (excluirUserId) filtro.id = { $ne: excluirUserId };

    const usuarios = await User.find(filtro).select('id').limit(limite).lean();
    return usuarios.map((u) => u.id);
}

/** Quantos jogadores desejam esta carta (para mostrar na /ficha). */
async function contarDesejos(cardId) {
    return User.countDocuments({ 'wishlist.cardId': cardId });
}

module.exports = {
    LIMITE_BASE,
    LIMITE_VIP,
    limiteDe,
    contem,
    adicionar,
    remover,
    listar,
    quemDeseja,
    contarDesejos
};
