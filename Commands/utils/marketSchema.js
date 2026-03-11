const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const marketSchema = new Schema({
    cardId: String,
    sellerId: String,
    cardName: String,
    series: String,
    seriesImage: String,
    baseImage: String,
    characterImage: String,
    rarity: String,
    overall: Number,
    ATA: Number,
    LIF: Number,
    POW: Number,
    obtainedAt: Date,
    marketValue: Number,
    listingPrice: Number,  // Novo campo para o preço definido pelo usuário
    status: { type: String, default: 'available' }
});

module.exports = mongoose.model('Market', marketSchema);
