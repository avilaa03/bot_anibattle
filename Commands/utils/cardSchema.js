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
    image: {
        type: String,
        required: true
    },
    rarity: {
        type: String,
        required: true
    },
    ovr: {
        type: Number,
        required: true
    },
    ata: {
        type: Number,
        required: true
    },
    int: {
        type: Number,
        required: true
    },
    def: {
        type: Number,
        required: true
    },
    des: {
        type: Number,
        required: true
    },
    pow: {
        type: Number,
        required: true
    },
    res: {
        type: Number,
        required: true
    }
});

const Card = mongoose.model('Card', cardSchema);

module.exports = Card;
