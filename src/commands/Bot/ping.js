const { Command } = require("../..");

module.exports = class PingCommand extends Command {
  constructor(client) {
    super(
      {
        name: "ping",
        aliases: ["pong"],
        category: "Bot",
        hidden: true,
        description: "Ping do Bot!",
        usage: "ping",
        utils: { devNeed: false },
      },
      client
    );
  }

  async run({ message }, args) {
    message.reply("aaa")
  }
};
