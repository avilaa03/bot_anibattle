const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const marketSchema = new Schema({
    cardId: String,
    sellerId: String,
    cardName: String,
    series: String,
    image: String,
    rarity: String,
    ovr: Number,
    ata: Number,
    int: Number,
    def: Number,
    des: Number,
    pow: Number,
    res: Number,
    obtainedAt: Date,
    marketValue: Number,
    listingPrice: Number,  // Novo campo para o preço definido pelo usuário
    status: { type: String, default: 'available' }
});

module.exports = mongoose.model('Market', marketSchema);
