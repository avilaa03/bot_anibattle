const BaseSlashCommand = require('../utils/BaseSlashCommand.js');
const nomes = require('../utils/commandNames.js');
const { SlashCommandBuilder } = require('discord.js');
const { descricaoBase, localizacoes } = require('../utils/i18n');
const desejosRun = require('../actions/run/wishlistRun.js');

module.exports = class WishlistSlashCommand extends BaseSlashCommand {
    constructor() {
        super('wishlist');
    }

    async run(client, interaction) {
        await desejosRun(client, interaction);
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setNameLocalizations(nomes.comando(this.name))
            .setDescription(descricaoBase('comandos.desejos.descricao'))
            .setDescriptionLocalizations(localizacoes('comandos.desejos.descricao'))
            .addUserOption(option =>
                option.setName('user')
                    .setDescription(descricaoBase('comandos.desejos.opcao_user'))
                    .setDescriptionLocalizations(localizacoes('comandos.desejos.opcao_user'))
                    .setRequired(false)
            )
            .toJSON();
    }
};
