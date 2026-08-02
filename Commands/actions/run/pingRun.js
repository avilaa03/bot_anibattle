const ui = require('../../utils/embeds');

async function pingRun(client, interaction) {
    await interaction.reply({ content: 'Calculando...' });
    const sent = await interaction.fetchReply();
    const roundtrip = sent.createdTimestamp - interaction.createdTimestamp;
    const wsLatency = Math.round(client.ws.ping);

    const pior = Math.max(roundtrip, wsLatency);
    const cor = pior < 200 ? ui.STATUS_COLORS.success : pior < 500 ? ui.STATUS_COLORS.warning : ui.STATUS_COLORS.error;
    const status = pior < 200 ? '🟢 Excelente' : pior < 500 ? '🟡 Aceitável' : '🔴 Lento';

    const embed = ui.base(cor)
        .setTitle('🏓 Pong')
        .addFields(
            { name: 'Resposta', value: `**${roundtrip}** ms`, inline: true },
            { name: 'WebSocket', value: `**${wsLatency}** ms`, inline: true },
            { name: 'Status', value: status, inline: true }
        );
    return interaction.editReply({ content: null, embeds: [embed] });
}

module.exports = pingRun;
