const { Command, Emojis } = require("../..");
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

module.exports = class EvalCommand extends Command {
  constructor(client) {
    super(
      {
        name: "eval",
        aliases: ["ex", "execute", "e"],
        category: "Developer",
        hidden: true,
        description: "Teste comandos e códigos!",
        usage: "eval <código>",
        utils: { devNeed: true },
      },
      client
    );
  }

  async run({ message }, args) {
    if (!this.client.developers.includes(message.author.id)) return;

    try {
      let evaled = eval(args.join(" "));

      if (typeof evaled !== "string") {
        evaled = require("util").inspect(evaled, { depth: 0 });
      }

      if (evaled === this.client.token) return;

      const row = new ActionRowBuilder().addComponents([
        new ButtonBuilder()
          .setStyle(ButtonStyle.Primary)
          .setCustomId("delete")
          .setLabel("Deletar"),
      ]);

      const msg = await message.reply({
        content: "```js\n" + evaled + "```",
        components: [row],
      });

      const filter = (interaction) => {
        return interaction.isButton() && interaction.message.id === msg.id;
      };

      msg
        .createMessageComponentCollector({
          filter: filter,
          time: 600000,
        })

        .on("collect", async (r) => {
          if (r.user.id != message.author.id)
            return r.reply({
              content: `${r.user}, somente quem usou o comando pode usar os botões.`,
              ephemeral: true,
            });

          msg.edit({
            content: `${message.author}, resultado fechado com sucesso.`,
            components: [],
          });
        });
    } catch (e) {
      message.reply(e.message);
    }
  }
};
