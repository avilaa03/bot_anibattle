const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const User = require("../../utils/userSchema");

async function battleRun(interaction) {
    const userX = interaction.user;
    const userY = interaction.options.getUser('user');

    // Verificações iniciais
    if (!userY) {
        return interaction.reply({ content: "Você precisa mencionar um usuário para desafiar!", ephemeral: true });
    }

    if (userY.bot) {
        return interaction.reply({ content: "Você não pode desafiar bots!", ephemeral: true });
    }

    if (userX.id === userY.id) {
        return interaction.reply({ content: "Você não pode desafiar a si mesmo!", ephemeral: true });
    }

    let userXData = await User.findOne({ id: userX.id });
    if (userXData.inventory.length < 3) {
        return interaction.reply({ content: `${userX.username}, você não tem cartas suficientes para batalhar!`, ephemeral: false });
    }

    let userYData = await User.findOne({ id: userY.id });
    if (!userYData || userYData.inventory.length < 3) {
        return interaction.reply({ content: `${userY.username} não tem cartas suficientes para batalhar!`, ephemeral: false });
    }

    // Envio do desafio
    const challengeEmbed = new EmbedBuilder()
        .setTitle('Desafio para um AniBattle!')
        .setDescription(`${userX.username} desafiou ${userY.username} para uma batalha!`)
        .setColor('#FFA500');

    const acceptButton = new ButtonBuilder()
        .setCustomId('accept_battle')
        .setLabel('Aceitar Batalha')
        .setStyle(ButtonStyle.Success);

    const actionRow = new ActionRowBuilder().addComponents(acceptButton);

    const challengeMessage = await interaction.reply({
        content: `${userY}, você foi desafiado por ${userX}!`,
        embeds: [challengeEmbed],
        components: [actionRow],
        fetchReply: true
    });

    return { userX, userY, userXData, userYData, challengeMessage };
}

module.exports = { battleRun };
