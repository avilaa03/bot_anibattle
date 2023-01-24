const { CommandContext } = require("../..");

module.exports = class InteractionCreate {
  constructor(client) {
    this.client = client;
  }

  async ON(interaction) {
    if (interaction.isCommand()) {
      if (!interaction.guild) return;

      const command = this.client.commands.get(interaction.commandName);

      interaction.author = interaction.user;

      const args = [];

      for (const option of interaction.options.data) {
        if (option.type === "SUB_COMMAND") {
          if (option.name) args.push(option.name);
          option.options?.forEach((x) => {
            if (x.value) args.push(x.value);
          });
        } else if (option.value) args.push(option.value);
      }

      const message = interaction;

      const context = new CommandContext({
        client: this.client,
        author: interaction.user,
        message,
        command,
      });

      command._run(context, args);
    }
  }
};
