const { EmbedBuilder } = require('discord.js');

async function pingRun(client, interaction) {
    const sent = await interaction.reply({ content: 'Calculando...', fetchReply: true });
    const roundtrip = sent.createdTimestamp - interaction.createdTimestamp;
    const wsLatency = Math.round(client.ws.ping);

    const embed = new EmbedBuilder()
        .setTitle('🏓 Pong!')
        .setColor('#4CAF50')
        .addFields(
            { name: 'Latência da API', value: `**${roundtrip}** ms`, inline: true },
            { name: 'WebSocket', value: `**${wsLatency}** ms`, inline: true }
        )
        .setFooter({ text: 'AniBattle' });
    return interaction.editReply({ content: null, embeds: [embed] });
}

module.exports = pingRun;