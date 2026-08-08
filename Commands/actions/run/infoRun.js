const User = require('../../utils/userSchema');
const Card = require('../../utils/cardSchema');
const ui = require('../../utils/embeds');
const { tDaInteracao } = require('../../utils/idioma');

async function infoRun(client, interaction) {
    const t = await tDaInteracao(interaction);
    await interaction.deferReply();

    const [totalJogadores, totalCartas] = await Promise.all([
        User.countDocuments(),
        Card.countDocuments()
    ]);

    const uptimeMs = client.uptime || 0;

    const embed = ui.base(ui.STATUS_COLORS.info)
        .setTitle('ℹ️ AniBattle')
        .setDescription(t('info.descricao'))
        .setThumbnail(client.user?.displayAvatarURL?.() || null)
        .addFields(
            { name: t('info.jogadores'), value: `**${ui.number(totalJogadores, t.locale)}**`, inline: true },
            { name: t('info.cartas'), value: `**${ui.number(totalCartas, t.locale)}**`, inline: true },
            { name: t('info.servidores'), value: `**${ui.number(client.guilds?.cache?.size || 0, t.locale)}**`, inline: true },
            { name: t('info.online_ha'), value: ui.duration(uptimeMs, t.locale), inline: true },
            { name: t('info.latencia'), value: `${Math.round(client.ws.ping)} ms`, inline: true },
            { name: t('info.criador'), value: '<@282895755688280065>', inline: true },
            { name: t('info.codigo'), value: '[GitHub](https://github.com/avilaa03/bot_animefight)', inline: false }
        );

    return interaction.editReply({ embeds: [embed] });
}

module.exports = infoRun;
