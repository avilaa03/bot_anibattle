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
    // O aprimoramento viaja com o anúncio.
    //
    // Sem estes dois campos, uma carta +16 vendida no mercado voltaria ao
    // comprador como carta natural: o anúncio guarda os atributos já
    // aprimorados, mas sem `base` o próximo `/aprimorar` recalcularia tudo
    // tratando o valor turbinado como natural — e sem `nivel` a carta
    // perderia o histórico que é justamente o que a torna única.
    //
    // É este par que permite existir mercado de carta aprimorada.
    nivel: { type: Number, default: 0 },
    base: {
        overall: Number,
        ATA: Number,
        LIF: Number,
        POW: Number
    },
    marketValue: Number,
    listingPrice: Number,  // Novo campo para o preço definido pelo usuário
    status: { type: String, default: 'available' }
});

marketSchema.index({ status: 1, listingPrice: 1 });
marketSchema.index({ sellerId: 1, status: 1 });

// Mesma rede de segurança dos outros schemas: carregar o arquivo duas
// vezes não pode derrubar o bot.
module.exports = mongoose.models.Market || mongoose.model('Market', marketSchema);
