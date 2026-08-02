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
    }]
});

UserSchema.index({ balance: -1 });
UserSchema.index({ 'discovered.cardId': 1 });

const User = mongoose.models.User || mongoose.model('User', UserSchema);

module.exports = User;
