const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const cardSchema = new Schema({
    // Número na Pokédex. Fixo para sempre depois de atribuído — é o que
    // permite dizer "carta #042" e a pessoa achar a mesma carta amanhã.
    // Cartas novas recebem o próximo número livre, nunca reaproveitam.
    numero: {
        type: Number,
        default: null
    },
    name: {
        type: String,
        required: true
    },
    series: {
        type: String,
        required: true
    },
    seriesImage: {
        type: String,
        default: ''
    },
    baseImage: {
        type: String,
        default: ''
    },
    characterImage: {
        type: String,
        required: true
    },
    rarity: {
        type: String,
        required: true
    },
    overall: {
        type: Number,
        required: true
    },
    ATA: {
        type: Number,
        required: true
    },
    LIF: {
        type: Number,
        required: true
    },
    POW: {
        type: Number,
        required: true
    }
}, { collection: 'new-cards' });

cardSchema.index({ rarity: 1 });
// sparse: cartas ainda sem número não conflitam entre si no índice único.
cardSchema.index({ numero: 1 }, { unique: true, sparse: true });

// `mongoose.models.Card ||` é rede de segurança: se este arquivo for
// carregado duas vezes (require com grafia diferente do caminho, ou hot
// reload), reaproveita o model já compilado em vez de estourar
// "Cannot overwrite `Card` model once compiled".
const Card = mongoose.models.Card || mongoose.model('Card', cardSchema);

module.exports = Card;
