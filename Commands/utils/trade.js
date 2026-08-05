const Trade = require('./tradeSchema');
const User = require('./userSchema');
const { registerDiscovery } = require('./discovery');
const { PRAZOS_TROCA, filtroExpirados, podeCancelarTroca } = require('./cicloDeVida');

/**
 * Trocas de carta por carta.
 *
 * O mercado já existe, mas obriga intermediar com moeda e confiar no
 * outro ("me vende por 1 e eu te vendo de volta"). A troca resolve isso:
 * os dois lados montam a oferta, os dois confirmam, e a transferência
 * acontece de uma vez só.
 *
 * A parte crítica é a mesma da batalha: entre montar a oferta e
 * confirmar, o jogador pode ter vendido a carta. Por isso a posse é
 * revalidada no banco no momento exato da execução.
 */

const TTL_MS = Number(process.env.TRADE_TTL_MS) > 0 ? Number(process.env.TRADE_TTL_MS) : 10 * 60 * 1000;
const MAX_CARTAS = 5;

function gerarTradeId() {
    return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** Já existe negociação aberta envolvendo esse jogador? */
async function temTrocaAtiva(userId) {
    const existe = await Trade.exists({
        fase: { $in: ['aguardando', 'montando', 'confirmando'] },
        $or: [{ 'proponente.id': userId }, { 'alvo.id': userId }]
    });
    return Boolean(existe);
}

async function criar(proponente, alvo, canalId) {
    return Trade.create({
        tradeId: gerarTradeId(),
        proponente: { id: proponente.id, username: proponente.username, cartas: [], confirmou: false },
        alvo: { id: alvo.id, username: alvo.username, cartas: [], confirmou: false },
        canalId,
        fase: 'aguardando'
    });
}

async function buscar(tradeId) {
    return Trade.findOne({ tradeId: String(tradeId) });
}

/** Encontra a negociação aberta de um jogador (fallback para botões). */
async function buscarPorUsuario(userId) {
    return Trade.findOne({
        fase: { $in: ['montando', 'confirmando'] },
        $or: [{ 'proponente.id': userId }, { 'alvo.id': userId }]
    });
}

function ladoDe(trade, userId) {
    if (trade.proponente.id === userId) return 'proponente';
    if (trade.alvo.id === userId) return 'alvo';
    return null;
}

/** Snapshot enxuto da carta, o suficiente para exibir e transferir. */
function resumirCarta(carta) {
    return {
        inventoryId: carta._id,
        originalCardId: carta.originalCardId,
        name: carta.name,
        series: carta.series,
        rarity: carta.rarity,
        overall: carta.overall,
        marketValue: carta.marketValue,
        // Só carta negociável entra numa oferta (o menu já filtra),
        // mas o campo viaja junto para a cópia entregue nascer
        // coerente do outro lado.
        comercializavel: carta.comercializavel !== false
    };
}

/**
 * Adiciona ou tira uma carta da oferta.
 *
 * Qualquer mexida na oferta zera as confirmações dos dois lados — senão
 * daria para confirmar uma oferta e trocar as cartas depois.
 */
async function alternarCarta(tradeId, userId, carta) {
    const trade = await buscar(tradeId);
    if (!trade || !['montando', 'confirmando'].includes(trade.fase)) return null;

    const lado = ladoDe(trade, userId);
    if (!lado) return null;

    const lista = trade[lado].cartas;
    const indice = lista.findIndex((c) => String(c.inventoryId) === String(carta._id));

    if (indice >= 0) {
        lista.splice(indice, 1);
    } else {
        if (lista.length >= MAX_CARTAS) return trade;
        lista.push(resumirCarta(carta));
    }

    trade.proponente.confirmou = false;
    trade.alvo.confirmou = false;
    trade.fase = 'montando';
    await trade.save();
    return trade;
}

async function confirmar(tradeId, userId) {
    const trade = await buscar(tradeId);
    if (!trade || !['montando', 'confirmando'].includes(trade.fase)) return null;

    const lado = ladoDe(trade, userId);
    if (!lado) return null;

    // Troca vazia dos dois lados não faz sentido.
    if (trade.proponente.cartas.length === 0 && trade.alvo.cartas.length === 0) return trade;

    trade[lado].confirmou = true;
    trade.fase = 'confirmando';
    await trade.save();
    return trade;
}

function ambosConfirmaram(trade) {
    return trade.proponente.confirmou && trade.alvo.confirmou;
}

/** Confere se o jogador ainda tem exatamente as cartas que ofereceu. */
async function validarPosse(userId, cartas) {
    if (cartas.length === 0) return { ok: true, faltando: [] };

    const user = await User.findOne({ id: userId }).select('inventory._id').lean();
    if (!user) return { ok: false, faltando: cartas.map((c) => c.name) };

    const possui = new Set((user.inventory || []).map((c) => String(c._id)));
    const faltando = cartas.filter((c) => !possui.has(String(c.inventoryId))).map((c) => c.name);
    return { ok: faltando.length === 0, faltando };
}

/**
 * Executa a troca.
 *
 * Ordem importante: primeiro remove dos dois, depois adiciona nos dois.
 * Se adicionássemos antes de remover, uma falha no meio deixaria carta
 * duplicada — e carta duplicada quebra a economia inteira.
 *
 * @returns {Promise<{ok: boolean, motivo?: string, faltando?: string[]}>}
 */
async function executar(tradeId) {
    const trade = await Trade.findOneAndUpdate(
        { tradeId: String(tradeId), fase: 'confirmando' },
        { fase: 'executando' },
        { new: true }
    );
    // Se veio null, outro clique já está executando esta troca.
    if (!trade) return { ok: false, motivo: 'JA_EXECUTANDO' };

    const [posseP, posseA] = await Promise.all([
        validarPosse(trade.proponente.id, trade.proponente.cartas),
        validarPosse(trade.alvo.id, trade.alvo.cartas)
    ]);

    if (!posseP.ok || !posseA.ok) {
        trade.fase = 'cancelada';
        await trade.save();
        return {
            ok: false,
            motivo: 'POSSE',
            faltando: [...posseP.faltando, ...posseA.faltando]
        };
    }

    const idsProponente = trade.proponente.cartas.map((c) => c.inventoryId);
    const idsAlvo = trade.alvo.cartas.map((c) => c.inventoryId);

    // Guarda os documentos completos antes de remover — precisamos deles
    // inteiros para reinserir do outro lado.
    const [docP, docA] = await Promise.all([
        User.findOne({ id: trade.proponente.id }).select('inventory').lean(),
        User.findOne({ id: trade.alvo.id }).select('inventory').lean()
    ]);

    const cartasDoProponente = (docP?.inventory || []).filter((c) => idsProponente.some((id) => String(id) === String(c._id)));
    const cartasDoAlvo = (docA?.inventory || []).filter((c) => idsAlvo.some((id) => String(id) === String(c._id)));

    // 1) Remove dos donos originais.
    if (idsProponente.length > 0) {
        await User.updateOne({ id: trade.proponente.id }, { $pull: { inventory: { _id: { $in: idsProponente } } } });
    }
    if (idsAlvo.length > 0) {
        await User.updateOne({ id: trade.alvo.id }, { $pull: { inventory: { _id: { $in: idsAlvo } } } });
    }

    // 2) Entrega para os novos donos.
    if (cartasDoProponente.length > 0) {
        await User.updateOne({ id: trade.alvo.id }, { $push: { inventory: { $each: cartasDoProponente } } });
    }
    if (cartasDoAlvo.length > 0) {
        await User.updateOne({ id: trade.proponente.id }, { $push: { inventory: { $each: cartasDoAlvo } } });
    }

    // 3) Pokédex de quem recebeu carta inédita.
    for (const carta of cartasDoProponente) {
        if (carta.originalCardId) await registerDiscovery(trade.alvo.id, carta.originalCardId);
    }
    for (const carta of cartasDoAlvo) {
        if (carta.originalCardId) await registerDiscovery(trade.proponente.id, carta.originalCardId);
    }

    trade.fase = 'concluida';
    await trade.save();

    return { ok: true, trade };
}

async function cancelar(tradeId) {
    return Trade.findOneAndUpdate(
        { tradeId: String(tradeId) },
        { fase: 'cancelada' },
        { new: true }
    );
}

async function apagar(tradeId) {
    await Trade.deleteOne({ tradeId: String(tradeId) });
}

/** Limpa negociações abandonadas. Não há nada a devolver: as cartas
 * nunca saem do inventário antes da execução. */
async function limparAbandonadas() {
    // Prazo por fase, não um só para tudo.
    //
    // A versão anterior apagava qualquer troca com mais de 10 minutos que
    // não estivesse concluída. Duas consequências ruins:
    //
    // - Um convite não aceito segurava o jogador por 10 minutos, sem ele
    //   ter como sair disso. Era o bug de "troca travada": `temTrocaAtiva`
    //   considera 'aguardando' ocupado, e nada tirava dali antes do prazo.
    // - Trocas em 'executando' entravam no filtro e podiam ser apagadas no
    //   meio da transferência.
    //
    // Agora convite morre em 2 minutos, negociação em 5, e execução
    // travada em 1 — ver `cicloDeVida.js`.
    const resultado = await Trade.deleteMany(
        filtroExpirados(PRAZOS_TROCA, 'fase', 'criadaEm')
    );
    return resultado.deletedCount || 0;
}

module.exports = {
    MAX_CARTAS,
    TTL_MS,
    PRAZOS_TROCA,
    podeCancelarTroca,
    gerarTradeId,
    temTrocaAtiva,
    criar,
    buscar,
    buscarPorUsuario,
    ladoDe,
    alternarCarta,
    confirmar,
    ambosConfirmaram,
    validarPosse,
    executar,
    cancelar,
    apagar,
    limparAbandonadas
};
