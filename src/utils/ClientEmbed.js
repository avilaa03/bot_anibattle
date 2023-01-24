const { EmbedBuilder } = require("discord.js");

module.exports = class ClientEmbed extends EmbedBuilder {
  constructor(user) {
    super(user);

    this.setColor("#5765f2");
    if (user)
      this.setFooter({
        text: `${user.tag}`,
        iconURL: user.displayAvatarURL({ dynamic: true }),
      }).setTimestamp();
  }
};
