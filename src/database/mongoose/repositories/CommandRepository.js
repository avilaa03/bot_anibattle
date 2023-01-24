const MongoRepository = require("../MongoRepository.js");
const CommandSchema = require("../schemas/CommandSchema.js");

module.exports = class GuildRepository extends MongoRepository {
  constructor(mongoose) {
    super(mongoose, mongoose.model("Commands", CommandSchema));
  }

  parse(entity) {
    return {
      usedCommands: 0,
      ...(super.parse(entity) || {}),
    };
  }
};
