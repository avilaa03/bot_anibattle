const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Trocas de carta entre jogadores.
 *
 * Persistida no banco pelo mesmo motivo da batalha: se o bot reiniciar no
 * meio de uma negociação, ninguém pode ficar sem a carta.
 */

const cartaOfertada = new Schema({
    inventoryId: Schema.Types.ObjectId,   // _id da cópia no inventário
    originalCardId: Schema.Types.ObjectId, // id no catálogo (para a Pokédex)
    name: String,
    series: String,
    rarity: String,
    overall: Number,
    marketValue: Number
}, { _id: false });

const tradeSchema = new Schema({
    tradeId: { type: String, required: true, unique: true },

    proponente: {
        id: { type: String, required: true },
        username: String,
        confirmou: { type: Boolean, default: false },
        cartas: [cartaOfertada]
    },
    alvo: {
        id: { type: String, required: true },
        username: String,
        confirmou: { type: Boolean, default: false },
        cartas: [cartaOfertada]
    },

    canalId: String,
    mensagemId: String,

    // aguardando → montando → confirmando → concluida/cancelada
    fase: { type: String, default: 'aguardando' },

    criadaEm: { type: Date, default: Date.now }
});

tradeSchema.index({ 'proponente.id': 1 });
tradeSchema.index({ 'alvo.id': 1 });
tradeSchema.index({ criadaEm: 1 });

module.exports = mongoose.models.Trade || mongoose.model('Trade', tradeSchema);
