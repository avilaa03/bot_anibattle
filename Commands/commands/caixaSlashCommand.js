const BaseSlashCommand = require('../utils/BaseSlashCommand.js');
const nomes = require('../utils/nomesDeComando.js');
const { SlashCommandBuilder } = require('discord.js');
const caixaRun = require('../actions/run/caixaRun.js');
const caixas = require('../utils/caixas.js');
const { descricaoBase, localizacoes, escolha } = require('../utils/i18n.js');

/**
 * As opções de caixa saem do catálogo, não de uma lista escrita à mão.
 * Caixa nova aparece no autocomplete sozinha no próximo deploy.
 *
 * A do Apoiador entra nas duas listas: ela não é comprável, mas precisa
 * ser abrível — e o `comprar` recusa ela com mensagem própria, que é mais
 * claro do que ela sumir do menu sem explicação.
 */
function opcoesDeCaixa() {
    // `escolha()` monta o `name_localizations` a partir do dicionário, então
    // quem usa o Discord em inglês já vê "Legendary Box" na hora de digitar.
    return Object.keys(caixas.CAIXAS).map((chave) => {
        const caixa = caixas.getCaixa(chave);
        return escolha(`caixas_catalogo.${chave}.nome`, chave, `${caixa.emoji} `);
    });
}

module.exports = class CaixaSlashCommand extends BaseSlashCommand {
    constructor() {
        super('box');
    }

    async run(client, interaction) {
        await caixaRun(client, interaction);
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setNameLocalizations(nomes.comando(this.name))
            .setDescription(descricaoBase('comandos.caixa.descricao'))
            .setDescriptionLocalizations(localizacoes('comandos.caixa.descricao'))
            .addSubcommand((sub) =>
                sub.setName('view')
                .setNameLocalizations(nomes.subcomando('box', 'view'))
                    .setDescription(descricaoBase('comandos.caixa.sub_ver'))
                    .setDescriptionLocalizations(localizacoes('comandos.caixa.sub_ver'))
            )
            .addSubcommand((sub) =>
                sub.setName('buy')
                .setNameLocalizations(nomes.subcomando('box', 'buy'))
                    .setDescription(descricaoBase('comandos.caixa.sub_comprar'))
                    .setDescriptionLocalizations(localizacoes('comandos.caixa.sub_comprar'))
                    .addStringOption((o) =>
                        o.setName('box')
                .setNameLocalizations(nomes.opcao('box'))
                            .setDescription(descricaoBase('comandos.caixa.opcao_caixa'))
                            .setDescriptionLocalizations(localizacoes('comandos.caixa.opcao_caixa'))
                            .addChoices(...opcoesDeCaixa()).setRequired(true))
                    .addIntegerOption((o) =>
                        o.setName('amount')
                .setNameLocalizations(nomes.opcao('amount'))
                            // O teto entra por marcador: o número mora no
                            // caixaRun, e mudá-lo lá acerta os dois idiomas.
                            .setDescription(descricaoBase('comandos.caixa.opcao_quantidade', { maximo: caixaRun.MAXIMO_POR_COMPRA }))
                            .setDescriptionLocalizations(localizacoes('comandos.caixa.opcao_quantidade', { maximo: caixaRun.MAXIMO_POR_COMPRA }))
                            .setMinValue(1).setMaxValue(caixaRun.MAXIMO_POR_COMPRA))
            )
            .addSubcommand((sub) =>
                sub.setName('open')
                .setNameLocalizations(nomes.subcomando('box', 'open'))
                    .setDescription(descricaoBase('comandos.caixa.sub_abrir'))
                    .setDescriptionLocalizations(localizacoes('comandos.caixa.sub_abrir'))
                    .addStringOption((o) =>
                        o.setName('box')
                .setNameLocalizations(nomes.opcao('box'))
                            .setDescription(descricaoBase('comandos.caixa.opcao_caixa'))
                            .setDescriptionLocalizations(localizacoes('comandos.caixa.opcao_caixa'))
                            .addChoices(...opcoesDeCaixa()).setRequired(true))
                    .addStringOption((o) =>
                        o.setName('series')
                .setNameLocalizations(nomes.opcao('series'))
                            .setDescription(descricaoBase('comandos.caixa.opcao_serie'))
                            .setDescriptionLocalizations(localizacoes('comandos.caixa.opcao_serie')))
            )
            .toJSON();
    }
};
