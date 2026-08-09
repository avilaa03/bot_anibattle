const BaseSlashCommand = require('../utils/BaseSlashCommand.js');
const { SlashCommandBuilder } = require('discord.js');
const idiomaRun = require('../actions/run/idiomaRun.js');
const { descricaoBase, localizacoes } = require('../utils/i18n');

/**
 * O nome do comando é o mesmo nos dois idiomas ("idioma"), mas com
 * `setNameLocalizations` quem usa o Discord em inglês digita `/language`.
 * O Discord resolve o nome localizado para o mesmo comando — é o único
 * jeito de ter um nome por idioma sem registrar dois comandos.
 */
module.exports = class IdiomaSlashCommand extends BaseSlashCommand {
    constructor() {
        super('idioma');
    }

    async run(client, interaction) {
        await idiomaRun(client, interaction);
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setNameLocalizations({ 'en-US': 'language' })
            .setDescription(descricaoBase('comandos.idioma.descricao'))
            .setDescriptionLocalizations(localizacoes('comandos.idioma.descricao'))
            .addStringOption(option =>
                option.setName('idioma')
                    .setNameLocalizations({ 'en-US': 'language' })
                    .setDescription(descricaoBase('comandos.idioma.opcao_idioma'))
                    .setDescriptionLocalizations(localizacoes('comandos.idioma.opcao_idioma'))
                    .setRequired(false)
                    .addChoices(
                        { name: '🇧🇷 Português (Brasil)', value: 'pt-BR' },
                        { name: '🇺🇸 English (US)', value: 'en-US' },
                        {
                            name: 'Automático / Automatic',
                            value: 'auto'
                        }
                    )
            )
            .addStringOption(option =>
                option.setName('escopo')
                    .setNameLocalizations({ 'en-US': 'scope' })
                    .setDescription(descricaoBase('comandos.idioma.opcao_escopo'))
                    .setDescriptionLocalizations(localizacoes('comandos.idioma.opcao_escopo'))
                    .setRequired(false)
                    .addChoices(
                        { name: 'Só para mim / Just me', value: 'mim' },
                        { name: 'Servidor inteiro / Whole server', value: 'servidor' }
                    )
            )
            .toJSON();
    }
};
