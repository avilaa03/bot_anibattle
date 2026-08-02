const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const UserSchema = new Schema({
    id: {
        type: String,
        required: true,
        unique: true
    },
    lastRoll: {
        type: Number,
        default: 0
    },
    inventory: [{
        cardId: mongoose.Schema.Types.ObjectId,
        originalCardId: mongoose.Schema.Types.ObjectId,
        name: String,
        series: String,
        seriesImage: String,
        baseImage: String,
        characterImage: String,
        rarity: String,
        overall: Number,
        ATA: Number,
        LIF: Number,
        POW: Number,
        obtainedAt: { type: Date, default: Date.now },
        marketValue: Number,
        valueToSell: Number
    }],
    balance: {
        type: Number,
        default: 0
    },
    wins: {
        type: Number,
        default: 0
    },
    losses: {
        type: Number,
        default: 0
    },
    lastDaily: {
        type: Date,
    },
    favCard: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Card'
    },
    // Pokédex: ids das cartas do catálogo que o jogador já teve em mãos
    // pelo menos uma vez. É um registro permanente — vender a carta não
    // apaga a descoberta, igual à Pokédex de Pokémon.
    discovered: [{
        cardId: { type: mongoose.Schema.Types.ObjectId, ref: 'Card' },
        firstObtainedAt: { type: Date, default: Date.now }
    }],
    // Assinatura VIP. expiresAt nulo significa vitalício.
    vip: {
        tier: { type: String, default: null },
        since: { type: Date, default: null },
        expiresAt: { type: Date, default: null }
    },
    // Cosméticos equipados. Ficam salvos mesmo se o VIP expirar — só
    // deixam de ser aplicados até a assinatura voltar.
    cosmetics: {
        moldura: { type: String, default: 'nenhuma' },
        corPerfil: { type: Number, default: null },
        banner: { type: String, default: null }
    }
});

UserSchema.index({ balance: -1 });
UserSchema.index({ 'discovered.cardId': 1 });

const User = mongoose.models.User || mongoose.model('User', UserSchema);

module.exports = User;
