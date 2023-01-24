const CommandContext = require("../../structures/CMD/CommandContext");

const GET_PREFIX = (message, PREFIXES) => {
  let verify = PREFIXES.some((Prefix) => message.content.startsWith(Prefix));
  return verify
    ? PREFIXES.find((Prefix) => message.content.startsWith(Prefix))
    : false;
};

const MENTIONS = (PREFIXES, id) => {
  for (const value of [`<@!${id}>`, `<@${id}>`]) PREFIXES.push(value);
};

const GET_MENTION = (id) => {
  return new RegExp(`^<@!?${id}>( |)$`);
};

module.exports = class Message {
  constructor(client) {
    this.client = client;
  }

  async ON(message) {
    if (
      !(
        this.client.database.guilds ||
        this.client.database.users ||
        this.client.database.comandos
      ) ||
      message.author.bot
    )
      return;

    const prefix = process.env.PREFIX || "!";

    const PREFIXES = [prefix];

    await MENTIONS(PREFIXES, this.client.user.id);
    const PREFIX = await GET_PREFIX(message, PREFIXES);

    const { maintence } = await this.client.database.clientUtils.findOne({
      _id: this.client.user.id,
    });

    if (maintence && !this.client.developers.includes(message.author.id))
      return;

    if (!PREFIX) return;

    if (message.content.match(await GET_MENTION(this.client.user.id)))
      message.reply({ content: `Olá, meu prefixo é \`${prefix}\`` });

    if (PREFIX && message.content.length > PREFIX.length) {
      const args = message.content.slice(PREFIX.length).trim().split(/ +/g);
      const cmd = args.shift().toLowerCase();

      const command = this.client.commands.find(
        (c) => c.name === cmd || (c.aliases && c.aliases.includes(cmd))
      );

      if (!command) return;

      const context = new CommandContext({
        client: this.client,
        author: message.author,
        message,
        command,
      });

      command._run(context, args);
    }
  }
};
