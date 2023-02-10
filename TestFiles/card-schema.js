const { ModalSubmitFields } = require('discord.js');
const { Schema, model, models } = require('mongoose');

const messageCountSchema = new Schema({
    number: {
        //Card Number
        type: Number,
        required: true,
    },
    name: {
        type: Number,
        required: true,
    }
});

const name = "message-counts";

module.exports = models[name] || model(name, messageCountSchema);