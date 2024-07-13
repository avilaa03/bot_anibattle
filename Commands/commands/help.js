const BaseSlashCommand = require('../utils/BaseSlashCommand');
const { SlashCommandBuilder } = require('discord.js');
const { EmbedBuilder } = require("discord.js");

module.exports = class HelpSlashCommand extends BaseSlashCommand {
    constructor() {
        super('help');
    }

    run(client, interaction) {
        
        const embed = new EmbedBuilder()
          .setTitle('Comandos')
          .addFields({name: "/roll", value: "Comando para roletar um personagem aleatório, podendo coletar para o inventário ou vender rapidamente"},
            {name: "/show", value: "Comando para mostrar uma carta do seu inventário, utilize o nome da carta para procurá-la"},
            {name: "/inventory", value: "Mostra o inventário com todas as cartas armazenadas"},
            {name: "/quicksell", value: "Venda rápida de uma carta, utilize o nome da carta para vendê-la"},
            {name: "/balance", value: "Utilizado para ver quanto tem no seu cofre, ou no de outro usuário, marcando-o depois de /balance"},
            {name: "/daily", value: "Resgatar recompensa diária"},
            {name: "/give", value: "Comando para dar dinheiro para outro usuário, marcando-o e escrevendo a quantia."},
            {name: "/info", value: "Informações do Bot"},
            {name: "/ping", value: "Não é muito útil, mas você pode tentar"},
            {name: "/dice", value: "Literalmente um dado, role de 1 a 6"}
            )

        interaction.reply({ embeds: [embed] });
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
        .setName(this.name)
        .setDescription('help command')
        .toJSON();
    }
}