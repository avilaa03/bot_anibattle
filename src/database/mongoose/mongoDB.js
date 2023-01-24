const DBWrapper = require("../DBWrapper.js");
const {
  UserRepository,
  GuildRepository,
  CommandRepository,
  ClientRepository,
} = require("./repositories");

const mongoose = require("mongoose");

module.exports = class MongoDB extends DBWrapper {
  constructor(options = {}) {
    super(options);
    this.mongoose = mongoose;
  }

  async connect() {
    const OPTIONS = {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    };

    await mongoose.set("strictQuery", false);

    return mongoose.connect(process.env.MONGODB_URI, OPTIONS).then((m) => {
      this.guilds = new GuildRepository(m);
      this.users = new UserRepository(m);
      this.commands = new CommandRepository(m);
      this.clientUtils = new ClientRepository(m);
    });
  }
};
