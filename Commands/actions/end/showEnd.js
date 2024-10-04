const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

function showEnd(message) {
    const disabledRow = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('prev')
                .setLabel('Anterior')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(true),
            new ButtonBuilder()
                .setCustomId('next')
                .setLabel('Próximo')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(true)
        );

    message.edit({ components: [disabledRow] });
}

module.exports = { showEnd };
