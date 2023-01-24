const { Client, Options } = require("discord.js");
const { EventLoader, CommandLoader, DatabaseLoader } = require("./loaders");
const { Message } = require("discord.js");

module.exports = class Tutorial extends Client {
  constructor() {
    super({
      intents: 33415,
      fetchAllMembers: true,
      messageCacheLifetime: 0,
      shardCount: 1,
      messageSweepInterval: 0,
      messageCacheMaxSize: 0,
      restTimeOffset: 0,
      failIfNotExists: false,
      partials: ["MESSAGE", "CHANNEL"],
      allowedMentions: { parse: ["users"], repliedUser: true },
      makeCache: Options.cacheWithLimits({
        StageInstanceManager: 0,
        ThreadMemberManager: 0,
        GuildBanManager: 0,
        ApplicationCommandManager: 0,
        ApplicationCommandPermissionsManager: 0,
        GuildApplicationCommandManager: 0,
        GuildEmojiRoleManager: 0,
        GuildInviteManager: 0,
        MessageManager: 0,
        GuildBanManager: 0,
      }),
    });

    this.developers = ["600804786492932101"];
  }

  async getUser(args, message = Message) {
    let user;

    if (!args || !message) return (user = message.author);

    if (/<@!?\d{17,18}>/.test(args))
      user = await message.client.users.fetch(args.match(/\d{17,18}/)?.[0]);
    else {
      try {
        user = await message.guild.members
          .search({ query: args, limit: 1, cache: false })
          .then((x) => x.first().user);
      } catch {}
      try {
        user = await message.client.users.fetch(args).catch(null);
      } catch {}
    }
    if (user) return user;
  }

  shorten(text, len) {
    if (typeof text !== "string") return "";
    if (text.length <= len) return text;
    return text.substr(0, len).trim() + "...";
  }

  login() {
    super.login(process.env.TOKEN);
  }

  initializeLoaders() {
    new CommandLoader(this).call({ dir: "commands" });
    new EventLoader(this).call();
    new DatabaseLoader(this).call();

    return this;
  }
};
