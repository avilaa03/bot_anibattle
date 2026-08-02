const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Batalhas em andamento, persistidas no banco.
 *
 * Antes isto vivia só na memória do processo. Como as apostas são
 * debitadas no aceite (escrow), um restart do bot no meio de um duelo
 * fazia as moedas simplesmente sumirem. Guardando no Mongo, o bot
 * consegue devolver as apostas ao subir de novo.
 */

// Só o necessário para o combate — não guardamos o inventário inteiro,
// que é relido do banco quando precisa ser exibido.
const cardSnapshot = new Schema({
    _id: Schema.Types.ObjectId,
    name: String,
    series: String,
    rarity: String,
    overall: Number,
    ATA: Number,
    LIF: Number,
    POW: Number
}, { _id: false });

const battleSchema = new Schema({
    battleId: { type: String, required: true, unique: true },

    userX: {
        id: { type: String, required: true },
        username: String
    },
    userY: {
        id: { type: String, required: true },
        username: String
    },

    wager: { type: Number, default: 0 },
    // Enquanto true, as apostas estão retidas pelo bot e precisam ser
    // devolvidas caso a batalha seja cancelada ou o bot reinicie.
    wagerHeld: { type: Boolean, default: true },

    challengeChannelId: String,

    deckX: [cardSnapshot],
    deckY: [cardSnapshot],
    selectedIdsX: [String],
    selectedIdsY: [String],

    messageXId: String,
    channelXId: String,
    messageYId: String,
    channelYId: String,

    phase: { type: String, default: 'choosing' },

    createdAt: { type: Date, default: Date.now }
});

battleSchema.index({ 'userX.id': 1 });
battleSchema.index({ 'userY.id': 1 });
battleSchema.index({ createdAt: 1 });

const Battle = mongoose.models.Battle || mongoose.model('Battle', battleSchema);

/** Cooldown entre duelos do mesmo par de jogadores. */
const battleCooldownSchema = new Schema({
    pairKey: { type: String, required: true, unique: true },
    lastAt: { type: Date, default: Date.now }
});

// Expira sozinho depois de 1h — não precisamos guardar histórico aqui.
battleCooldownSchema.index({ lastAt: 1 }, { expireAfterSeconds: 3600 });

const BattleCooldown = mongoose.models.BattleCooldown || mongoose.model('BattleCooldown', battleCooldownSchema);

module.exports = { Battle, BattleCooldown };
