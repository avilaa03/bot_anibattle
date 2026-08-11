const ui = require('../../utils/embeds');
const { tDaInteracao } = require('../../utils/language');

async function pingRun(client, interaction) {
    const t = await tDaInteracao(interaction);

    await interaction.reply({ content: t('ping.calculando') });
    const sent = await interaction.fetchReply();
    const roundtrip = sent.createdTimestamp - interaction.createdTimestamp;
    const wsLatency = Math.round(client.ws.ping);

    const pior = Math.max(roundtrip, wsLatency);
    const cor = pior < 200 ? ui.STATUS_COLORS.success : pior < 500 ? ui.STATUS_COLORS.warning : ui.STATUS_COLORS.error;
    const status = pior < 200
        ? t('ping.excelente')
        : pior < 500 ? t('ping.aceitavel') : t('ping.lento');

    const embed = ui.base(cor)
        .setTitle(t('ping.titulo'))
        .addFields(
            { name: t('ping.resposta'), value: `**${roundtrip}** ms`, inline: true },
            { name: 'WebSocket', value: `**${wsLatency}** ms`, inline: true },
            { name: t('ping.status'), value: status, inline: true }
        );
    return interaction.editReply({ content: null, embeds: [embed] });
}

module.exports = pingRun;
