const User = require('./userSchema');
const Payment = require('./paymentSchema');
const { TIERS, calcularExpiracao } = require('./vip');

/**
 * Concessão de VIP.
 *
 * Ponto único por onde um plano é ativado, seja por webhook de pagamento
 * ou por ativação manual. Centralizar aqui garante que a idempotência e o
 * registro de auditoria valham para os dois caminhos.
 */

class VipError extends Error {
    constructor(codigo, mensagem) {
        super(mensagem);
        this.codigo = codigo;
    }
}

/**
 * Ativa (ou renova) o VIP de um usuário.
 *
 * @param {object} params
 * @param {string} params.discordUserId
 * @param {string} params.tier          bronze | prata | ouro | master
 * @param {number} [params.meses]       padrão 1
 * @param {string} params.providerPaymentId  id único do pagamento
 * @param {string} [params.provider]    mercadopago | stripe | manual
 * @param {number} [params.valorBRL]
 * @param {object} [params.payloadBruto]
 * @returns {Promise<{user, payment, duplicado: boolean}>}
 */
async function concederVip({
    discordUserId,
    tier,
    meses = 1,
    providerPaymentId,
    provider = 'manual',
    valorBRL = 0,
    payloadBruto = null
}) {
    if (!discordUserId) throw new VipError('SEM_USUARIO', 'discordUserId é obrigatório.');
    if (!TIERS[tier]) throw new VipError('TIER_INVALIDO', `Plano "${tier}" não existe.`);
    if (!providerPaymentId) throw new VipError('SEM_ID_PAGAMENTO', 'providerPaymentId é obrigatório (idempotência).');
    if (!(meses > 0)) throw new VipError('MESES_INVALIDO', 'meses precisa ser maior que zero.');

    // Idempotência: se este pagamento já foi processado, não concede de novo.
    const jaProcessado = await Payment.findOne({ providerPaymentId }).lean();
    if (jaProcessado) {
        const user = await User.findOne({ id: discordUserId }).lean();
        return { user, payment: jaProcessado, duplicado: true };
    }

    const usuarioAtual = await User.findOne({ id: discordUserId }).lean();
    const expiresAt = calcularExpiracao(usuarioAtual, meses);

    const user = await User.findOneAndUpdate(
        { id: discordUserId },
        {
            $set: {
                'vip.tier': tier,
                'vip.expiresAt': expiresAt
            },
            $setOnInsert: { 'vip.since': new Date() }
        },
        { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    // Se o usuário já existia mas nunca foi VIP, marca a data de início.
    if (!user.vip.since) {
        user.vip.since = new Date();
        await user.save();
    }

    let payment;
    try {
        payment = await Payment.create({
            providerPaymentId,
            provider,
            discordUserId,
            tier,
            meses,
            valorBRL,
            status: 'aprovado',
            payloadBruto
        });
    } catch (err) {
        // Corrida: dois webhooks idênticos chegando juntos. O índice único
        // barra o segundo — o VIP já foi concedido, então seguimos.
        if (err.code === 11000) {
            payment = await Payment.findOne({ providerPaymentId }).lean();
            return { user, payment, duplicado: true };
        }
        throw err;
    }

    return { user, payment, duplicado: false };
}

/** Remove o VIP (para estorno/chargeback). */
async function revogarVip(discordUserId, motivo = 'revogado') {
    const user = await User.findOneAndUpdate(
        { id: discordUserId },
        { $set: { 'vip.tier': null, 'vip.expiresAt': null } },
        { new: true }
    );
    if (user) {
        console.log(`VIP revogado de ${discordUserId} (${motivo}).`);
    }
    return user;
}

module.exports = { concederVip, revogarVip, VipError };
