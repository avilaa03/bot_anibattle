const { EmbedBuilder } = require('discord.js');

function Dice() {
    return 1 + Math.floor(Math.random() * 6);
}

async function diceRun(client, interaction) {
    const dice = Dice();
    const embed = new EmbedBuilder()
        .setTitle('🎲 Dado')
        .setColor('#2196F3')
        .setDescription('Você rolou um dado de 6 lados.')
        .addFields({ name: 'Resultado', value: `**${dice}**`, inline: true })
        .setFooter({ text: 'AniBattle' });
    return interaction.reply({ embeds: [embed] });
}

module.exports = diceRun;