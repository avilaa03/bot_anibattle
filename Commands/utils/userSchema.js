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
        number: Number,
        name: String,
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
        obtainedAt: { type: Date, default: Date.now } 
    }]
});

const User = mongoose.model('User', UserSchema);

module.exports = User;