const User = require('./userSchema');
const { getPerks } = require('./vip');

/**
 * Regras de economia do bot.
 *
 * Um ponto importante de design: o jogo precisa de *sinks* — lugares onde
 * a moeda sai de circulação de vez. Sem isso, tudo que entra (roll, daily,
 * batalha) fica na economia para sempre, os preços inflacionam e o mercado
 * perde o sentido. A taxa do mercado abaixo é o primeiro sink real.
 */

// Percentual retido pelo bot em cada venda no mercado. Essa moeda é
// destruída (não vai para ninguém), o que combate a inflação.
const MARKET_TAX_RATE = Number(process.env.MARKET_TAX_RATE) >= 0 && Number(process.env.MARKET_TAX_RATE) <= 0.5
    ? Number(process.env.MARKET_TAX_RATE)
    : 0.05;

// Aposta mínima obrigatória em uma batalha.
const MIN_WAGER = Number(process.env.MIN_WAGER) > 0 ? Number(process.env.MIN_WAGER) : 10;

/**
 * A alíquota que vale para um vendedor específico.
 *
 * O VIP reduz a taxa — é conveniência, não poder: o assinante paga menos
 * pedágio para fazer exatamente o que qualquer um já faz.
 *
 * ⚠️ Quem manda é o VENDEDOR, não o comprador. É ele que arca com a taxa
 * (`sellerReceives = total - tax`), então cobrar pelo plano de quem
 * compra faria o mesmo anúncio render valores diferentes conforme quem
 * clicasse — impossível de explicar e impossível de prever ao anunciar.
 *
 * @param {object|null} vendedor documento do usuário que está vendendo
 */
function marketTaxRate(vendedor = null) {
    return MARKET_TAX_RATE * getPerks(vendedor).taxaMercadoMultiplier;
}

/**
 * Quanto o vendedor recebe de fato, e quanto foi retido de taxa.
 *
 * @param {number} price
 * @param {object|null} vendedor documento do vendedor; ausente = alíquota cheia
 */
function applyMarketTax(price, vendedor = null) {
    const total = Math.max(0, Math.floor(Number(price) || 0));
    const rate = marketTaxRate(vendedor);
    const tax = Math.floor(total * rate);
    return { total, tax, rate, sellerReceives: total - tax };
}

/**
 * Debita `amount` do saldo do usuário de forma atômica, só se ele tiver saldo
 * suficiente no momento exato da escrita (evita corrida entre ações que
 * mexem no mesmo saldo, ex: /give e /market ao mesmo tempo).
 * Retorna o documento atualizado, ou null se não havia saldo suficiente.
 */
async function trySpend(userId, amount) {
    if (!(amount > 0)) return null;
    return User.findOneAndUpdate(
        { id: userId, balance: { $gte: amount } },
        { $inc: { balance: -amount } },
        { new: true }
    );
}

/**
 * Credita `amount` no saldo do usuário de forma atômica. Cria o usuário
 * (upsert) se ele ainda não existir no banco.
 */
async function addBalance(userId, amount) {
    if (!(amount > 0)) return null;
    return User.findOneAndUpdate(
        { id: userId },
        { $inc: { balance: amount } },
        { new: true, upsert: true, setDefaultsOnInsert: true }
    );
}

module.exports = {
    MARKET_TAX_RATE,
    MIN_WAGER,
    marketTaxRate,
    applyMarketTax,
    trySpend,
    addBalance
};
