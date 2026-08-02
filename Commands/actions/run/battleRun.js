const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const User = require("../../utils/userSchema");
const ui = require('../../utils/embeds');

function battleErrorEmbed(title, description) {
    return ui.error(title.replace(/^❌\s*/, ''), description);
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
    const challengeEmbed = ui.base(ui.STATUS_COLORS.warning)
        .setTitle('⚔️ Desafio de batalha')
        .setDescription(`**${userX.username}** desafiou **${userY.username}** para um duelo 3 vs 3!`)
        .addFields(
            { name: userX.username, value: `🎴 ${userXData.inventory.length} cartas\n⚔️ ${userXData.wins || 0}V — ${userXData.losses || 0}D`, inline: true },
            { name: 'vs', value: '​', inline: true },
            { name: userY.username, value: `🎴 ${userYData.inventory.length} cartas\n⚔️ ${userYData.wins || 0}V — ${userYData.losses || 0}D`, inline: true }
        )
        .setFooter({ text: `${ui.BRAND} • O desafio expira em 30 segundos` });

    const acceptButton = new ButtonBuilder()
        .setCustomId('accept_battle')
        .setLabel('Aceitar duelo')
        .setEmoji('⚔️')
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
