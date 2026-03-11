const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const User = require("../../utils/userSchema");

function battleErrorEmbed(title, description) {
    return new EmbedBuilder().setTitle(title).setDescription(description).setColor('#E53935');
}

async function battleRun(interaction) {
    const userX = interaction.user;
    const userY = interaction.options.getUser('user');

    if (!userY) {
        return interaction.reply({ embeds: [battleErrorEmbed('❌ Usuário necessário', 'Você precisa mencionar um usuário para desafiar!')], ephemeral: true });
    }

    if (userY.bot) {
        return interaction.reply({ embeds: [battleErrorEmbed('❌ Inválido', 'Você não pode desafiar bots!')], ephemeral: true });
    }

    if (userX.id === userY.id) {
        return interaction.reply({ embeds: [battleErrorEmbed('❌ Inválido', 'Você não pode desafiar a si mesmo!')], ephemeral: true });
    }

    let userXData = await User.findOne({ id: userX.id });
    if (!userXData || userXData.inventory.length < 3) {
        return interaction.reply({ embeds: [battleErrorEmbed('❌ Cartas insuficientes', `${userX.username}, você precisa de pelo menos 3 cartas para batalhar!`)], ephemeral: false });
    }

    let userYData = await User.findOne({ id: userY.id });
    if (!userYData || userYData.inventory.length < 3) {
        return interaction.reply({ embeds: [battleErrorEmbed('❌ Oponente sem cartas', `${userY.username} não tem 3 cartas ou mais para batalhar!`)], ephemeral: false });
    }
    const challengeEmbed = new EmbedBuilder()
        .setTitle('Desafio para um AniBattle!')
        .setDescription(`${userX.username} desafiou ${userY.username} para uma batalha!`)
        .setColor('#FFA500');

    const acceptButton = new ButtonBuilder()
        .setCustomId('accept_battle')
        .setLabel('Aceitar Batalha')
        .setStyle(ButtonStyle.Success);

    const actionRow = new ActionRowBuilder().addComponents(acceptButton);

    await interaction.reply({
        content: `${userY}, você foi desafiado por ${userX}!`,
        embeds: [challengeEmbed],
        components: [actionRow]
    });
    const challengeMessage = await interaction.fetchReply();

    return { userX, userY, userXData, userYData, challengeMessage };
}

module.exports = { battleRun };
