const BaseSlashCommand = require("../utils/BaseSlashCommand");
const { SlashCommandBuilder } = require("discord.js");
const { descricaoBase, localizacoes } = require('../utils/i18n');
const dailyRun = require("../actions/run/dailyRun")

module.exports = class DailySlashCommand extends BaseSlashCommand {
  constructor() {
    super("daily");
  }

  async run(client, interaction) {
    await dailyRun(client, interaction)
  }

  getSlashCommandJSON() {
    return new SlashCommandBuilder()
      .setName(this.name)
      .setDescription(descricaoBase('comandos.daily.descricao'))
            .setDescriptionLocalizations(localizacoes('comandos.daily.descricao'))
      .toJSON();
  }
}
