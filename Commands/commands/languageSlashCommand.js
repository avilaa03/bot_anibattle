const BaseSlashCommand = require('../utils/BaseSlashCommand.js');
const nomes = require('../utils/nomesDeComando.js');
const { SlashCommandBuilder } = require('discord.js');
const idiomaRun = require('../actions/run/languageRun.js');
const { descricaoBase, localizacoes, escolha } = require('../utils/i18n');

/**
 * Este comando já nascia com nome por idioma, e foi o modelo do resto:
 * hoje TODOS os comandos têm o canônico em inglês e um apelido por
 * idioma, num mapa só (`utils/nomesDeComando.js`).
 *
 * O canônico virou `language`; quem usa o Discord em português continua
 * digitando `/idioma`, e o Discord resolve os dois para o mesmo comando.
 */
module.exports = class LanguageSlashCommand extends BaseSlashCommand {
    constructor() {
        super('language');
    }

    async run(client, interaction) {
        await idiomaRun(client, interaction);
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setNameLocalizations(nomes.comando(this.name))
            .setDescription(descricaoBase('comandos.idioma.descricao'))
            .setDescriptionLocalizations(localizacoes('comandos.idioma.descricao'))
            .addStringOption(option =>
                option.setName('language')
                    .setNameLocalizations(nomes.opcao('language'))
                    .setDescription(descricaoBase('comandos.idioma.opcao_idioma'))
                    .setDescriptionLocalizations(localizacoes('comandos.idioma.opcao_idioma'))
                    .setRequired(false)
                    // Os nomes dos idiomas ficam em si mesmos, não
                    // traduzidos: quem procura inglês procura "English",
                    // esteja o bot em que idioma estiver. É o mesmo motivo
                    // pelo qual todo seletor de idioma do mundo faz assim.
                    .addChoices(
                        { name: '🇧🇷 Português (Brasil)', value: 'pt-BR' },
                        { name: '🇺🇸 English (US)', value: 'en-US' },
                        { name: '🇪🇸 Español', value: 'es-ES' },
                        escolha('idioma.opcao_automatico', 'auto')
                    )
            )
            .addStringOption(option =>
                option.setName('scope')
                    .setNameLocalizations(nomes.opcao('scope'))
                    .setDescription(descricaoBase('comandos.idioma.opcao_escopo'))
                    .setDescriptionLocalizations(localizacoes('comandos.idioma.opcao_escopo'))
                    .setRequired(false)
                    .addChoices(
                        escolha('idioma.escopo_mim', 'me'),
                        escolha('idioma.escopo_servidor', 'server')
                    )
            )
            .toJSON();
    }
};
