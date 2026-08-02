const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const cardSchema = new Schema({
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

const Card = mongoose.model('Card', cardSchema);

module.exports = Card;
