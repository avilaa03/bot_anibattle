const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const User = require('../../utils/userSchema');
const ui = require('../../utils/embeds');
const torneio = require('../../utils/tournament');
const { MIN_WAGER } = require('../../utils/economy');

/** /torneio — cria um torneio eliminatório no servidor. */

function montarEmbedInscricoes(t) {
    const lista = t.participantes.length > 0
        ? t.participantes.map((p, i) => `\`${i + 1}\` <@${p.id}>`).join('\n')
        : '*(ninguém inscrito ainda)*';

    return ui.base(ui.STATUS_COLORS.warning)
        .setTitle(`🏆 ${t.nome}`)
        .setDescription(
            `Torneio eliminatório de **${t.vagas} vagas**.\n\n`
            + 'Você entra com suas **3 melhores cartas**, e o bot resolve todos os confrontos de uma vez.\n'
            + '⚠️ *O deck é congelado na inscrição — não dá para trocar depois de ver o adversário.*'
        )
        .addFields(
            { name: 'Inscritos', value: `**${t.participantes.length}** / ${t.vagas}`, inline: true },
            { name: 'Inscrição', value: t.taxaInscricao > 0 ? ui.coins(t.taxaInscricao) : 'Grátis', inline: true },
            { name: '🏅 Prêmio', value: t.premio > 0 ? ui.coins(t.premio) : 'Só a glória', inline: true },
            { name: 'Participantes', value: lista, inline: false }
        )
        .setFooter({ text: `${ui.BRAND} • O organizador pode começar a qualquer momento` });
}

function montarBotoes(t) {
    return [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`tn_join_${t.tournamentId}`).setLabel('Entrar').setEmoji('⚔️').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`tn_leave_${t.tournamentId}`).setLabel('Sair').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`tn_start_${t.tournamentId}`).setLabel('Começar').setEmoji('🏁').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`tn_cancel_${t.tournamentId}`).setLabel('Cancelar').setStyle(ButtonStyle.Danger)
    )];
}

async function torneioRun(client, interaction) {
    const recusar = (titulo, descricao) =>
        interaction.reply({ embeds: [ui.error(titulo, descricao)], ephemeral: true });

    if (!interaction.guildId) {
        return recusar('Só em servidor', 'Torneios precisam de um servidor — não funcionam no privado.');
    }

    const existente = await torneio.ativoNoServidor(interaction.guildId);
    if (existente) {
        return recusar('Já tem torneio rolando', `Existe um torneio em andamento neste servidor (**${existente.nome}**). Termine ou cancele antes de criar outro.`);
    }

    const nome = interaction.options.getString('nome');
    const vagas = interaction.options.getInteger('vagas') || 8;
    const taxa = interaction.options.getInteger('inscricao') || 0;

    if (!torneio.VAGAS_VALIDAS.includes(vagas)) {
        return recusar('Vagas inválidas', `Use ${torneio.VAGAS_VALIDAS.join(', ')} vagas.`);
    }
    if (taxa > 0 && taxa < MIN_WAGER) {
        return recusar('Inscrição muito baixa', `A inscrição mínima é ${ui.coins(MIN_WAGER)}.`);
    }

    const t = await torneio.criar({
        guildId: interaction.guildId,
        canalId: interaction.channelId,
        criadorId: interaction.user.id,
        nome,
        taxaInscricao: taxa,
        vagas
    });

    await interaction.reply({
        embeds: [montarEmbedInscricoes(t)],
        components: montarBotoes(t)
    });
    const mensagem = await interaction.fetchReply();

    t.mensagemId = mensagem.id;
    await t.save();
}

module.exports = torneioRun;
module.exports.montarEmbedInscricoes = montarEmbedInscricoes;
module.exports.montarBotoes = montarBotoes;
