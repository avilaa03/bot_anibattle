const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const marketSchema = new Schema({
    cardId: String,
    // Referência à carta no catálogo (coleção new-cards). Sem isto, a carta
    // perdia o vínculo com o catálogo ao passar pelo mercado e o comprador
    // não conseguia registrá-la na Pokédex.
    originalCardId: { type: Schema.Types.ObjectId, ref: 'Card' },
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

marketSchema.index({ status: 1, listingPrice: 1 });
marketSchema.index({ sellerId: 1, status: 1 });

// Mesma rede de segurança dos outros schemas: carregar o arquivo duas
// vezes não pode derrubar o bot.
module.exports = mongoose.models.Market || mongoose.model('Market', marketSchema);
