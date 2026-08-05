const BaseSlashCommand = require('../utils/BaseSlashCommand.js');
const { SlashCommandBuilder } = require('discord.js');
const caixaRun = require('../actions/run/caixaRun.js');
const caixas = require('../utils/caixas.js');

/**
 * As opções de caixa saem do catálogo, não de uma lista escrita à mão.
 * Caixa nova aparece no autocomplete sozinha no próximo deploy.
 *
 * A do Apoiador entra nas duas listas: ela não é comprável, mas precisa
 * ser abrível — e o `comprar` recusa ela com mensagem própria, que é mais
 * claro do que ela sumir do menu sem explicação.
 */
function opcoesDeCaixa() {
    return caixas.todas().map((c) => ({ name: `${c.emoji} ${c.nome}`, value: c.chave }));
}

module.exports = class CaixaSlashCommand extends BaseSlashCommand {
    constructor() {
        super('caixa');
    }

    async run(client, interaction) {
        await caixaRun(client, interaction);
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription('Caixas de cartas — compre, guarde e abra quando quiser')
            .addSubcommand((sub) =>
                sub.setName('ver').setDescription('Mostra as caixas, as chances e quantas você tem')
            )
            .addSubcommand((sub) =>
                sub.setName('comprar')
                    .setDescription('Compra uma caixa e guarda na sua bolsa')
                    .addStringOption((o) =>
                        o.setName('caixa').setDescription('Qual caixa')
                            .addChoices(...opcoesDeCaixa()).setRequired(true))
                    .addIntegerOption((o) =>
                        o.setName('quantidade')
                            .setDescription(`Quantas (1 a ${caixaRun.MAXIMO_POR_COMPRA})`)
                            .setMinValue(1).setMaxValue(caixaRun.MAXIMO_POR_COMPRA))
            )
            .addSubcommand((sub) =>
                sub.setName('abrir')
                    .setDescription('Abre uma caixa da sua bolsa')
                    .addStringOption((o) =>
                        o.setName('caixa').setDescription('Qual caixa')
                            .addChoices(...opcoesDeCaixa()).setRequired(true))
                    .addStringOption((o) =>
                        o.setName('serie')
                            .setDescription('Só para a Caixa Temática: a série que você quer'))
            )
            .toJSON();
    }
};
