const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const User = require("../../utils/userSchema");
const ui = require('../../utils/embeds');
const { MIN_WAGER } = require('../../utils/economy');
const { temBatalhaAtiva, cooldownRestante } = require('../../utils/battleState');

async function battleRun(interaction) {
    const userX = interaction.user;
    const userY = interaction.options.getUser('user');
    const apostaPedida = interaction.options.getInteger('aposta');
    const wager = apostaPedida && apostaPedida > MIN_WAGER ? apostaPedida : MIN_WAGER;

    const recusar = (titulo, descricao) =>
        interaction.reply({ embeds: [ui.error(titulo, descricao)], ephemeral: true });

    if (!userY) {
        return recusar('Usuário necessário', 'Você precisa mencionar alguém para desafiar.');
    }
    if (userY.bot) {
        return recusar('Alvo inválido', 'Você não pode desafiar bots.');
    }
    if (userX.id === userY.id) {
        return recusar('Alvo inválido', 'Você não pode desafiar a si mesmo.');
    }

    if (await temBatalhaAtiva(userX.id)) {
        return recusar('Batalha em andamento', 'Você já está em uma batalha. Termine ela antes de começar outra.');
    }
    if (await temBatalhaAtiva(userY.id)) {
        return recusar('Oponente ocupado', `**${userY.username}** já está em uma batalha no momento.`);
    }

    const restante = await cooldownRestante(userX.id, userY.id);
    if (restante > 0) {
        return recusar('Muito rápido', `Vocês dois acabaram de duelar. Esperem ${ui.duration(restante)} antes de batalhar de novo.`);
    }

    const userXData = await User.findOne({ id: userX.id });
    if (!userXData || userXData.inventory.length < 3) {
        return recusar('Cartas insuficientes', 'Você precisa de pelo menos **3 cartas** para batalhar. Use `/roll` para conseguir mais.');
    }

    const userYData = await User.findOne({ id: userY.id });
    if (!userYData || userYData.inventory.length < 3) {
        return recusar('Oponente sem cartas', `**${userY.username}** não tem 3 cartas para batalhar.`);
    }

    // Confere o saldo dos dois antes de propor — não adianta abrir o
    // desafio se um dos lados não consegue cobrir a aposta.
    if ((userXData.balance || 0) < wager) {
        return recusar('Saldo insuficiente', `A aposta é de ${ui.coins(wager)} e você tem ${ui.coins(userXData.balance || 0)}.`);
    }
    if ((userYData.balance || 0) < wager) {
        return recusar('Oponente sem saldo', `**${userY.username}** não tem ${ui.coins(wager)} para cobrir a aposta.`);
    }

    const challengeEmbed = ui.base(ui.STATUS_COLORS.warning)
        .setTitle('⚔️ Desafio de batalha')
        .setDescription(`**${userX.username}** desafiou **${userY.username}** para um duelo 3 vs 3!\n\n💰 Aposta: ${ui.coins(wager)} de cada lado — **o vencedor leva ${ui.coins(wager * 2)}**.`)
        .addFields(
            { name: userX.username, value: `🎴 ${userXData.inventory.length} cartas\n⚔️ ${userXData.wins || 0}V — ${userXData.losses || 0}D`, inline: true },
            { name: 'vs', value: '​', inline: true },
            { name: userY.username, value: `🎴 ${userYData.inventory.length} cartas\n⚔️ ${userYData.wins || 0}V — ${userYData.losses || 0}D`, inline: true }
        )
        .setFooter({ text: `${ui.BRAND} • O desafio expira em 60 segundos` });

    const acceptButton = new ButtonBuilder()
        .setCustomId('accept_battle')
        .setLabel(`Aceitar e apostar ${ui.number(wager)}`)
        .setEmoji('⚔️')
        .setStyle(ButtonStyle.Success);

    const declineButton = new ButtonBuilder()
        .setCustomId('decline_battle')
        .setLabel('Recusar')
        .setStyle(ButtonStyle.Secondary);

    const actionRow = new ActionRowBuilder().addComponents(acceptButton, declineButton);

    await interaction.reply({
        content: `${userY}, você foi desafiado por ${userX}!`,
        embeds: [challengeEmbed],
        components: [actionRow]
    });
    const challengeMessage = await interaction.fetchReply();

    return { userX, userY, userXData, userYData, challengeMessage, wager };
}

module.exports = { battleRun };
