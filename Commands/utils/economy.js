const User = require('./userSchema');

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

module.exports = { trySpend, addBalance };
