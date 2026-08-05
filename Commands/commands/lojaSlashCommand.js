const BaseSlashCommand = require('../utils/BaseSlashCommand.js');
const { SlashCommandBuilder } = require('discord.js');
const lojaRun = require('../actions/run/lojaRun.js');
const itens = require('../utils/itens.js');
const rollExtra = require('../utils/rollExtra.js');

module.exports = class LojaSlashCommand extends BaseSlashCommand {
    constructor() {
        super('loja');
    }

    async run(client, interaction) {
        await lojaRun(client, interaction);
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription('Troca moedas por itens')
            .addSubcommand((sub) => sub
                .setName('ver')
                .setDescription('Mostra o que está à venda'))
            .addSubcommand((sub) => sub
                .setName('comprar')
                .setDescription('Compra um item da loja')
                .addStringOption((opt) => opt
                    .setName('item')
                    .setDescription('O que você quer comprar')
                    .setRequired(true)
                    // As opções saem do catálogo: item novo em `utils/itens.js`
                    // aparece aqui sozinho, sem ninguém lembrar de vir editar.
                    .addChoices(...itens.itensDaLoja().map((i) => ({
                        name: `${i.emoji} ${i.nome}`,
                        value: i.chave
                    }))))
                .addIntegerOption((opt) => opt
                    .setName('quantidade')
                    .setDescription('Quantos (padrão: 1)')
                    .setMinValue(1)
                    .setMaxValue(1000)))
            .addSubcommand((sub) => sub
                .setName('roll-extra')
                .setDescription(
                    `Adianta seu próximo /roll (até ${rollExtra.LIMITE_DIARIO} por dia, e o preço sobe a cada um)`
                ))
            .toJSON();
    }
};
