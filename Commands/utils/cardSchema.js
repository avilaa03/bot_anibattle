const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const cardSchema = new Schema({
    number: {
        type: Number,
        required: true
    },
    name: {
        type: String,
        required: true
    },
    image: {
        type: String,
        required: true
    },
    rarity: {
        type: String,
        required: true
    },
    attack: {
        type: Number,
        required: true
    },
    defense: {
        type: Number,
        required: true
    },
    health: {
        type: Number,
        required: true
    },
    power: {
        type: Number,
        required: true
    }
});

const Card = mongoose.model('Card', cardSchema);

module.exports = Card;
