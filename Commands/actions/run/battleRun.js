const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const User = require("../../utils/userSchema");
const ui = require('../../utils/embeds');
const { MIN_WAGER } = require('../../utils/economy');
const { temBatalhaAtiva, cooldownRestante } = require('../../utils/battleState');
const { tDaInteracao } = require('../../utils/language');

async function battleRun(interaction) {
    // O duelo tem dois donos, mas uma mensagem só. Ela sai no idioma de
    // quem desafiou — é quem disparou o comando, e o desafiado recebe uma
    // menção que o Discord mostra igual em qualquer idioma.
    const t = await tDaInteracao(interaction);

    const userX = interaction.user;
    const userY = interaction.options.getUser('user');
    const apostaPedida = interaction.options.getInteger('wager');
    const wager = apostaPedida && apostaPedida > MIN_WAGER ? apostaPedida : MIN_WAGER;

    const recusar = (tituloChave, descricaoChave, valores) =>
        interaction.reply({
            embeds: [ui.error(t(tituloChave), t(descricaoChave, valores))],
            flags: MessageFlags.Ephemeral
        });

    if (!userY) {
        return recusar('battle.usuario_necessario', 'battle.usuario_necessario_texto');
    }
    if (userY.bot) {
        return recusar('battle.alvo_invalido', 'battle.sem_bots');
    }
    if (userX.id === userY.id) {
        return recusar('battle.alvo_invalido', 'battle.sem_si_mesmo');
    }

    if (await temBatalhaAtiva(userX.id)) {
        return recusar('battle.em_andamento', 'battle.em_andamento_texto');
    }
    if (await temBatalhaAtiva(userY.id)) {
        return recusar('battle.oponente_ocupado', 'battle.oponente_ocupado_texto', { jogador: userY.username });
    }

    const restante = await cooldownRestante(userX.id, userY.id);
    if (restante > 0) {
        return recusar('battle.muito_rapido', 'battle.muito_rapido_texto', { tempo: ui.duration(restante, t.locale) });
    }

    const userXData = await User.findOne({ id: userX.id });
    if (!userXData || userXData.inventory.length < 3) {
        return recusar('battle.cartas_insuficientes', 'battle.cartas_insuficientes_texto');
    }

    const userYData = await User.findOne({ id: userY.id });
    if (!userYData || userYData.inventory.length < 3) {
        return recusar('battle.oponente_sem_cartas', 'battle.oponente_sem_cartas_texto', { jogador: userY.username });
    }

    // Confere o saldo dos dois antes de propor — não adianta abrir o
    // desafio se um dos lados não consegue cobrir a aposta.
    if ((userXData.balance || 0) < wager) {
        return recusar('comum.saldo_insuficiente', 'battle.sem_saldo_texto', {
            aposta: ui.coins(wager, t.locale),
            saldo: ui.coins(userXData.balance || 0, t.locale)
        });
    }
    if ((userYData.balance || 0) < wager) {
        return recusar('battle.oponente_sem_saldo', 'battle.oponente_sem_saldo_texto', {
            jogador: userY.username,
            aposta: ui.coins(wager, t.locale)
        });
    }

    const ficha = (dados) => t('battle.ficha_jogador', {
        cartas: dados.inventory.length,
        vitorias: dados.wins || 0,
        derrotas: dados.losses || 0
    });

    const challengeEmbed = ui.base(ui.STATUS_COLORS.warning)
        .setTitle(t('battle.desafio_titulo'))
        .setDescription(t('battle.desafio_texto', {
            desafiante: userX.username,
            desafiado: userY.username,
            aposta: ui.coins(wager, t.locale),
            premio: ui.coins(wager * 2, t.locale)
        }))
        .addFields(
            { name: userX.username, value: ficha(userXData), inline: true },
            { name: t('battle.vs'), value: '​', inline: true },
            { name: userY.username, value: ficha(userYData), inline: true }
        )
        .setFooter({ text: `${ui.BRAND} • ${t('battle.rodape_expira')}` });

    const acceptButton = new ButtonBuilder()
        .setCustomId('accept_battle')
        .setLabel(t('battle.botao_aceitar', { valor: ui.number(wager, t.locale) }))
        .setEmoji('⚔️')
        .setStyle(ButtonStyle.Success);

    const declineButton = new ButtonBuilder()
        .setCustomId('decline_battle')
        .setLabel(t('battle.botao_recusar'))
        .setStyle(ButtonStyle.Secondary);

    const actionRow = new ActionRowBuilder().addComponents(acceptButton, declineButton);

    await interaction.reply({
        content: t('battle.mencao_desafio', { desafiado: String(userY), desafiante: String(userX) }),
        embeds: [challengeEmbed],
        components: [actionRow]
    });
    const challengeMessage = await interaction.fetchReply();

    return { userX, userY, userXData, userYData, challengeMessage, wager, t };
}

module.exports = { battleRun };
