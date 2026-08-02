const User = require('./userSchema');
const Card = require('./cardSchema');
const achievements = require('./achievements');
const missoes = require('./missoes');

/**
 * Ponto central de progressão.
 *
 * Toda ação relevante do jogo passa por `registrar()`: rolar, vencer,
 * trocar, vender. Daqui saem os contadores, o progresso das missões e a
 * checagem de conquistas.
 *
 * Centralizar assim evita o problema de cada comando ter que lembrar de
 * atualizar cinco lugares diferentes — e de esquecer um.
 */

const RARIDADES = ['common', 'rare', 'ultra rare', 'legendary', 'master'];

/**
 * Monta o contexto que as condições de conquista precisam.
 * Faz as contas derivadas (inventário por raridade, séries completas)
 * uma vez só.
 */
async function montarContexto(user) {
    const inventario = user.inventory || [];

    const porRaridade = Object.fromEntries(RARIDADES.map((r) => [r, 0]));
    for (const carta of inventario) {
        const chave = String(carta.rarity || 'common').toLowerCase();
        if (porRaridade[chave] !== undefined) porRaridade[chave]++;
    }

    const descobertas = (user.discovered || []).length;
    const totalCatalogo = await Card.countDocuments();

    // Séries completas: quantas séries o jogador descobriu por inteiro.
    // Só calculamos se ele já tem uma quantidade que torne isso possível,
    // porque é a consulta mais cara daqui.
    let seriesCompletas = 0;
    if (descobertas >= 2) {
        const idsDescobertos = (user.discovered || []).map((d) => d.cardId);
        const [totaisPorSerie, descobertasPorSerie] = await Promise.all([
            Card.aggregate([{ $group: { _id: '$series', total: { $sum: 1 } } }]),
            Card.aggregate([
                { $match: { _id: { $in: idsDescobertos } } },
                { $group: { _id: '$series', total: { $sum: 1 } } }
            ])
        ]);
        const mapaTotal = Object.fromEntries(totaisPorSerie.map((s) => [s._id, s.total]));
        for (const s of descobertasPorSerie) {
            if (mapaTotal[s._id] && s.total >= mapaTotal[s._id]) seriesCompletas++;
        }
    }

    return {
        stats: user.stats || {},
        balance: user.balance || 0,
        totalCartas: inventario.length,
        porRaridade,
        descobertas,
        totalCatalogo,
        seriesCompletas,
        streakMaior: user.streak?.maior || 0,
        picoElo: user.picoElo || 1000,
        favCard: user.favCard
    };
}

/**
 * Verifica e grava conquistas novas.
 * @returns {Promise<Array>} troféus recém-desbloqueados (objetos do catálogo)
 */
async function verificarConquistas(userId, userDoc = null) {
    const user = userDoc || await User.findOne({ id: userId }).lean();
    if (!user) return [];

    const jaTem = new Set((user.conquistas || []).map((c) => c.chave));
    const contexto = await montarContexto(user);
    const merecidas = achievements.avaliar(contexto);

    const novas = merecidas.filter((chave) => !jaTem.has(chave));
    if (novas.length === 0) return [];

    await User.updateOne(
        { id: userId },
        {
            $push: {
                conquistas: {
                    $each: novas.map((chave) => ({ chave, desbloqueadaEm: new Date() }))
                }
            }
        }
    );

    return novas.map((chave) => achievements.porChave(chave)).filter(Boolean);
}

/**
 * Registra uma ação do jogador.
 *
 * @param {string} userId
 * @param {object} contadores  incrementos em `stats` (ex: { rolls: 1 })
 * @param {object} [opcoes]
 * @param {string[]} [opcoes.eventosMissao] eventos para progredir missões
 * @param {boolean} [opcoes.checarConquistas] padrão true
 * @returns {Promise<{conquistas: Array, missoesCompletas: Array}>}
 */
async function registrar(userId, contadores = {}, opcoes = {}) {
    const { eventosMissao = [], checarConquistas = true } = opcoes;

    const incrementos = {};
    for (const [chave, valor] of Object.entries(contadores)) {
        if (valor) incrementos[`stats.${chave}`] = valor;
    }

    if (Object.keys(incrementos).length > 0) {
        await User.updateOne({ id: userId }, { $inc: incrementos }, { upsert: true });
    }

    let missoesCompletas = [];
    if (eventosMissao.length > 0) {
        missoesCompletas = await missoes.progredir(userId, eventosMissao);
    }

    const conquistas = checarConquistas ? await verificarConquistas(userId) : [];

    return { conquistas, missoesCompletas };
}

module.exports = { registrar, verificarConquistas, montarContexto };
