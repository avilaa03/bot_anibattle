const User = require('../../utils/userSchema');
const Card = require('../../utils/cardSchema');
const ui = require('../../utils/embeds');

async function infoRun(client, interaction) {
    await interaction.deferReply();

    const [totalJogadores, totalCartas] = await Promise.all([
        User.countDocuments(),
        Card.countDocuments()
    ]);

    const uptimeMs = client.uptime || 0;

    const embed = ui.base(ui.STATUS_COLORS.info)
        .setTitle('ℹ️ AniBattle')
        .setDescription('Bot de coleção e batalha de cards de personagens de anime.')
        .setThumbnail(client.user?.displayAvatarURL?.() || null)
        .addFields(
            { name: '👥 Jogadores', value: `**${ui.number(totalJogadores)}**`, inline: true },
            { name: '🎴 Cartas no catálogo', value: `**${ui.number(totalCartas)}**`, inline: true },
            { name: '🌐 Servidores', value: `**${ui.number(client.guilds?.cache?.size || 0)}**`, inline: true },
            { name: '⏱️ Online há', value: ui.duration(uptimeMs), inline: true },
            { name: '📡 Latência', value: `${Math.round(client.ws.ping)} ms`, inline: true },
            { name: '👤 Criador', value: '<@282895755688280065>', inline: true },
            { name: '💻 Código', value: '[GitHub](https://github.com/avilaa03/bot_animefight)', inline: false }
        );

    return interaction.editReply({ embeds: [embed] });
}

module.exports = infoRun;
