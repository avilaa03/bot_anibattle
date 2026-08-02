const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Registro de pagamentos.
 *
 * Serve para duas coisas: auditoria (saber quem pagou o quê e quando) e
 * idempotência — o mesmo `providerPaymentId` nunca é processado duas
 * vezes, mesmo que o provedor reenvie o webhook, o que é comum.
 */
const paymentSchema = new Schema({
    // Id do pagamento no provedor (Mercado Pago, Stripe...). Único.
    providerPaymentId: { type: String, required: true, unique: true },
    provider: { type: String, default: 'manual' },

    discordUserId: { type: String, required: true, index: true },
    tier: { type: String, required: true },
    meses: { type: Number, default: 1 },
    valorBRL: { type: Number, default: 0 },

    status: { type: String, default: 'aprovado' },
    processadoEm: { type: Date, default: Date.now },
    // Guarda o corpo original do webhook, para conferência posterior.
    payloadBruto: { type: Schema.Types.Mixed }
});

paymentSchema.index({ processadoEm: -1 });

module.exports = mongoose.models.Payment || mongoose.model('Payment', paymentSchema);
