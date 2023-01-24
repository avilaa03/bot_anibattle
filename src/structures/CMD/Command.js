const CommandUtils = require("./CommandUtils");
const ClientEmbed = require("../../utils/ClientEmbed");

module.exports = class Command {
  constructor(options = {}, client) {
    this.client = client;
    this.name = options.name;
    this.aliases = options.aliases || [];
    this.category = options.category || "Nenhuma";
    this.description = options.description || "";
    this.usage = options.usage || "";

    this.Permissions = options.Permissions || ["SendMessages"];
    this.UserPermissions = options.UserPermissions || [];

    this.options = options.options;

    this.utils = options.utils;

    this.reference = options.reference;

    this.subcommand = options.subcommand;
  }

  async _run(context, args) {
    const { message, command } = context;

    try {
      if (!(await this.client.database.clientUtils.verify(this.client.user.id)))
        await this.client.database.clientUtils.add({
          _id: this.client.user.id,
        });

      if (!(await this.client.database.guilds.verify(message.guild.id)))
        await this.client.database.guilds.add({ _id: message.guild.id });

      if (!(await this.client.database.users.verify(message.author.id)))
        await this.client.database.users.add({ _id: message.author.id });

      await this.client.database.commands.update(
        { _id: command.name },
        { $inc: { usages: 1 } }
      );

      await this.client.database.users.update(
        { _id: message.author.id },
        { $inc: { usedCommands: 1 } }
      );

      const UserNeedPerm = { need: false, perms: [] };

      if (context.command.UserPermissions.length) {
        await this.MemberPermissions({
          perms: context.command.UserPermissions,
          user: context.author,
          message: context.message,
          UserNeedPerm,
        });
      }

      await this.ON(context, args);

      await this.run(context, args);
    } catch (e) {
      this.error(context, e);
    }
  }

  async MemberPermissions({
    perms,
    user,
    message,
    UserNeedPerm,
    ERR_USAGE = "",
  }) {
    for (let perm of perms) {
      if (!message.channel.permissionsFor(user).has(perm))
        UserNeedPerm.perms.push(perm);
    }

    if (UserNeedPerm.perms.length >= 1) {
      UserNeedPerm.need = true;
      ERR_USAGE =
        UserNeedPerm.perms.length == 1
          ? "Você precisa da permissão:"
          : "Você precisa das permissões:";

      return message.reply({
        embeds: [
          new ClientEmbed(user)
            .setAuthor({
              name: `${user.username} - Sem Permissão`,
              iconURL: user.displayAvatarURL({ dynamic: true }),
            })
            .setDescription(
              `${user}, você não pode usar esse comando.\n\n> ${ERR_USAGE} ${UserNeedPerm.perms
                .map((perm) => `**${perm}**`)
                .join(", ")} `
            ),
        ],
      });
    } else true;
  }

  error({ message, author, command }, error) {
    if (error.message === "DEVELOPERS") return;

    const EMBED_ERROR = new ClientEmbed()
      .setTitle(`Erro ao executar um Comando`)
      .addFields(
        {
          name: `● Comando:`,
          value: command.name,
          inline: true,
        },
        {
          name: `● Autor do Comando:`,
          value: author.tag,
          inline: true,
        },
        {
          name: `● Error:`,
          value: error.message,
        }
      )
      .setThumbnail(
        author.displayAvatarURL({ dynamic: true, format: "png", size: 2048 })
      )
      .setFooter({
        text: author.tag,
        iconURL: author.displayAvatarURL({ dynamic: true }),
      });

    this.client.channels.cache
      .get(JSON.parse(process.env.LOGS)["ERROR"])
      .send({ embeds: [EMBED_ERROR] });

    const EMBED_USER = new ClientEmbed()
      .setAuthor({
        name: author.username,
        iconURL: author.displayAvatarURL({ dynamic: true }),
      })
      .setDescription(
        `${author}, me desculpa, encontrei um erro ao executar este comando.\n\n> Erro: **${error.message}**`
      )
      .setColor("RED")
      .setTimestamp();

    return message.reply({ embeds: [EMBED_USER] });
  }

  ON(context, args) {
    return this.utils ? CommandUtils.util(context, this.utils, args) : true;
  }
};
