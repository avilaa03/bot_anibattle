const { Schema } = require("mongoose");

module.exports = new Schema({
  _id: {
    type: String,
  },
  usedCommands: { type: Number, default: 0 },
});
