const BaseSlashCommand = require('../utils/BaseSlashCommand.js');
const nomes = require('../utils/nomesDeComando.js');
const { SlashCommandBuilder } = require('discord.js');
const lojaRun = require('../actions/run/lojaRun.js');
const itens = require('../utils/itens.js');
const rollExtra = require('../utils/rollExtra.js');
const { descricaoBase, localizacoes, escolha } = require('../utils/i18n.js');

module.exports = class LojaSlashCommand extends BaseSlashCommand {
    constructor() {
        super('shop');
    }

    async run(client, interaction) {
        await lojaRun(client, interaction);
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setNameLocalizations(nomes.comando(this.name))
            .setDescription(descricaoBase('comandos.loja.descricao'))
            .setDescriptionLocalizations(localizacoes('comandos.loja.descricao'))
            .addSubcommand((sub) => sub
                .setName('view')
                .setNameLocalizations(nomes.subcomando('shop', 'view'))
                .setDescription(descricaoBase('comandos.loja.sub_ver'))
                .setDescriptionLocalizations(localizacoes('comandos.loja.sub_ver')))
            .addSubcommand((sub) => sub
                .setName('buy')
                .setNameLocalizations(nomes.subcomando('shop', 'buy'))
                .setDescription(descricaoBase('comandos.loja.sub_comprar'))
                .setDescriptionLocalizations(localizacoes('comandos.loja.sub_comprar'))
                .addStringOption((opt) => opt
                    .setName('item')
                    .setDescription(descricaoBase('comandos.loja.opcao_item'))
                    .setDescriptionLocalizations(localizacoes('comandos.loja.opcao_item'))
                    .setRequired(true)
                    // As opções saem do catálogo: item novo em `utils/itens.js`
                    // aparece aqui sozinho, sem ninguém lembrar de vir editar.
                    // O nome vem do dicionário pelas duas pontas — `escolha()`
                    // monta o `name_localizations`, então quem usa o Discord em
                    // inglês vê "Upgrade Gem" já na hora de digitar.
                    .addChoices(...Object.values(itens.ITENS)
                        .filter((i) => i.preco != null)
                        .sort((a, b) => a.ordem - b.ordem)
                        .map((i) => escolha(`itens_catalogo.${i.chave}.nome`, i.chave, `${i.emoji} `))))
                .addIntegerOption((opt) => opt
                    .setName('amount')
                    .setNameLocalizations(nomes.opcao('amount'))
                    .setDescription(descricaoBase('comandos.loja.opcao_quantidade'))
                    .setDescriptionLocalizations(localizacoes('comandos.loja.opcao_quantidade'))
                    .setMinValue(1)
                    .setMaxValue(1000)))
            // O limite entra por marcador: o número mora em `rollExtra.js`, e
            // uma mudança lá acompanha a descrição nos dois idiomas sozinha.
            .addSubcommand((sub) => sub
                .setName('extra-roll')
                .setNameLocalizations(nomes.subcomando('shop', 'extra-roll'))
                .setDescription(descricaoBase('comandos.loja.sub_roll_extra', { limite: rollExtra.LIMITE_DIARIO }))
                .setDescriptionLocalizations(
                    localizacoes('comandos.loja.sub_roll_extra', { limite: rollExtra.LIMITE_DIARIO })
                ))
            .toJSON();
    }
};
