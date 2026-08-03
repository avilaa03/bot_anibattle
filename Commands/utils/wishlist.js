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
 * REGRA QUE NÃO PODE SER QUEBRADA: desejar não disputa nada.
 *
 * No AniBattle, a carta rolada vira uma cópia ÚNICA no inventário de quem
 * rolou — não existe carta "solta" que dois jogadores possam reivindicar.
 * A lista de desejos é só um aviso: "apareceu, e está com fulano". O que
 * ela cria é conversa e movimento no mercado ("te dou 5 mil nessa"), não
 * corrida por clique.
 *
 * Isso é o oposto do modelo de bot em que a carta aparece no canal e o
 * primeiro a clicar leva. Ali a wishlist é aviso de leilão; aqui é aviso
 * de oportunidade de negócio. Qualquer texto de comando que sugira
 * "disputa" está errado e precisa ser corrigido.
 *
 * A contagem de quantos desejam a mesma carta não mede concorrência pela
 * cópia: mede procura, ou seja, quanto ela deve valer numa troca.
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
