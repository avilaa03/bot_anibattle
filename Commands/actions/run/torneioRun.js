const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
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

/**
 * Botões do torneio.
 *
 * O Discord não deixa mostrar botões diferentes para pessoas diferentes na
 * mesma mensagem — todo mundo vê os quatro. Como só o organizador pode
 * começar e cancelar, os dois botões dele levam o rótulo no nome.
 *
 * Sem isso, um participante clicava em "Cancelar" achando que era o jeito
 * de sair do torneio, e levava um "sem permissão" sem entender por quê.
 * Quem entrou sai pelo "Sair"; encerrar não é assunto dele.
 */
function montarBotoes(t) {
    return [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`tn_join_${t.tournamentId}`).setLabel('Entrar').setEmoji('⚔️').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`tn_leave_${t.tournamentId}`).setLabel('Sair').setEmoji('🚪').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`tn_start_${t.tournamentId}`).setLabel('Começar (organizador)').setEmoji('🏁').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`tn_cancel_${t.tournamentId}`).setLabel('Cancelar (organizador)').setStyle(ButtonStyle.Danger)
    )];
}

/**
 * Só quem criou o torneio pode começar ou cancelar.
 *
 * Cheguei a abrir isso para quem tem "Gerenciar servidor", pensando no
 * caso do criador sumir e travar o servidor. Estava errado: torneio com
 * inscrição paga é dinheiro dos participantes, e qualquer moderador poder
 * encerrar o de outra pessoa é poder demais para o problema que resolve.
 *
 * O caso do criador ausente já tem duas saídas que não exigem isso: a
 * varredura automática cancela sozinha (1 hora parado em inscrições,
 * 5 minutos travado em execução) e o `npm run torneios:limpar` resolve na
 * hora quando for urgente.
 */
function podeAdministrar(interaction, t) {
    return interaction.user.id === t.criadorId;
}

/**
 * Resposta quando já existe torneio aberto no servidor.
 *
 * A versão antiga só dizia "termine ou cancele antes de criar outro" — e
 * não dizia como. O botão de cancelar mora na mensagem original do
 * torneio, que pode estar centenas de mensagens acima ou num canal que a
 * pessoa nem lembra. Aqui damos o link direto e, para quem tem permissão,
 * o próprio botão.
 */
async function avisarTorneioExistente(interaction, t) {
    const inscritos = t.participantes.length;
    const criadoEm = Math.floor(new Date(t.criadoEm).getTime() / 1000);
    const expiraEm = Math.floor((new Date(t.criadoEm).getTime() + torneio.TTL_MS) / 1000);

    const embed = ui.warning(
        'Já tem torneio aberto neste servidor',
        `**${t.nome}** — criado por <@${t.criadorId}> <t:${criadoEm}:R>.`
    ).addFields(
        { name: 'Situação', value: t.fase === 'inscricoes' ? 'Inscrições abertas' : 'Executando', inline: true },
        { name: 'Inscritos', value: `${inscritos} / ${t.vagas}`, inline: true },
        { name: 'Cancela sozinho', value: `<t:${expiraEm}:R>`, inline: true }
    );

    // Link direto para a mensagem do torneio, onde estão os botões.
    if (t.canalId && t.mensagemId) {
        embed.addFields({
            name: 'Onde fica',
            value: `[Ir para a mensagem do torneio](https://discord.com/channels/${t.guildId}/${t.canalId}/${t.mensagemId})`,
            inline: false
        });
    }

    const componentes = [];
    if (podeAdministrar(interaction, t)) {
        componentes.push(new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`tn_cancel_${t.tournamentId}`)
                .setLabel('Cancelar este torneio')
                .setEmoji('🗑️')
                .setStyle(ButtonStyle.Danger)
        ));
        embed.setFooter({ text: `${ui.BRAND} • Cancelar devolve as inscrições pagas` });
    } else {
        embed.setFooter({
            text: `${ui.BRAND} • Só quem criou pode cancelar. Sem resposta, cancela sozinho no prazo acima`
        });
    }

    return interaction.reply({ embeds: [embed], components: componentes, flags: MessageFlags.Ephemeral });
}

async function torneioRun(client, interaction) {
    const recusar = (titulo, descricao) =>
        interaction.reply({ embeds: [ui.error(titulo, descricao)], flags: MessageFlags.Ephemeral });

    if (!interaction.guildId) {
        return recusar('Só em servidor', 'Torneios precisam de um servidor — não funcionam no privado.');
    }

    const existente = await torneio.ativoNoServidor(interaction.guildId);
    if (existente) {
        return avisarTorneioExistente(interaction, existente);
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
module.exports.podeAdministrar = podeAdministrar;
