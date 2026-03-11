const { EmbedBuilder } = require('discord.js');

async function infoRun(client, interaction) {
    const embed = new EmbedBuilder()
        .setTitle('ℹ️ AniBattle')
        .setDescription('Bot de batalhas de personagens de animes em desenvolvimento.')
        .setColor(0x0099FF)
        .addFields(
            { name: 'Criador', value: '<@282895755688280065>', inline: true },
            { name: 'Open Source', value: 'Sim', inline: true },
            { name: 'Repositório', value: '[GitHub](https://github.com/avilaa03/bot_animefight)', inline: false }
        )
        .setFooter({ text: 'AniBattle' });
    return interaction.reply({ embeds: [embed] });
}

module.exports = infoRun;