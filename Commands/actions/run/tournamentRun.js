const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const User = require('../../utils/userSchema');
const ui = require('../../utils/embeds');
const torneio = require('../../utils/tournament');
const { MIN_WAGER } = require('../../utils/economy');
const { tDaInteracao, tDoUsuario } = require('../../utils/language');

/**
 * /torneio — cria um torneio eliminatório no servidor.
 *
 * ## Qual idioma cada coisa usa
 *
 * O QUADRO do torneio (a mensagem com a lista de inscritos e os botões)
 * fica no canal por horas e é lido por todo mundo — então ele segue o
 * idioma do SERVIDOR, não o de quem clicou por último. Se seguisse o
 * clique, o quadro trocaria de idioma sozinho a cada inscrição.
 *
 * Já as respostas privadas ("você não tem cartas", "só o organizador
 * pode começar") saem no idioma de quem clicou — ninguém mais as vê.
 *
 * Convenção: `torneioDoc` é o documento; `t` é sempre o tradutor.
 */

function montarEmbedInscricoes(torneioDoc, t) {
    const lista = torneioDoc.participantes.length > 0
        ? torneioDoc.participantes.map((p, i) => `\`${i + 1}\` <@${p.id}>`).join('\n')
        : t('torneio.ninguem_inscrito');

    return ui.base(ui.STATUS_COLORS.warning)
        .setTitle(`🏆 ${torneioDoc.nome}`)
        .setDescription(t('torneio.quadro_descricao', { vagas: torneioDoc.vagas }))
        .addFields(
            { name: t('torneio.inscritos'), value: `**${torneioDoc.participantes.length}** / ${torneioDoc.vagas}`, inline: true },
            {
                name: t('torneio.inscricao'),
                value: torneioDoc.taxaInscricao > 0 ? ui.coins(torneioDoc.taxaInscricao, t.locale) : t('torneio.gratis'),
                inline: true
            },
            {
                name: t('torneio.premio'),
                value: torneioDoc.premio > 0 ? ui.coins(torneioDoc.premio, t.locale) : t('torneio.so_a_gloria'),
                inline: true
            },
            { name: t('torneio.participantes'), value: lista, inline: false }
        )
        .setFooter({ text: `${ui.BRAND} • ${t('torneio.rodape_quadro')}` });
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
function montarBotoes(torneioDoc, t) {
    return [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`tn_join_${torneioDoc.tournamentId}`).setLabel(t('torneio.botao_entrar')).setEmoji('⚔️').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`tn_leave_${torneioDoc.tournamentId}`).setLabel(t('torneio.botao_sair')).setEmoji('🚪').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`tn_start_${torneioDoc.tournamentId}`).setLabel(t('torneio.botao_comecar')).setEmoji('🏁').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`tn_cancel_${torneioDoc.tournamentId}`).setLabel(t('torneio.botao_cancelar')).setStyle(ButtonStyle.Danger)
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
function podeAdministrar(interaction, torneioDoc) {
    return interaction.user.id === torneioDoc.criadorId;
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
async function avisarTorneioExistente(interaction, torneioDoc, t) {
    const inscritos = torneioDoc.participantes.length;
    const criadoEm = Math.floor(new Date(torneioDoc.criadoEm).getTime() / 1000);
    const expiraEm = Math.floor((new Date(torneioDoc.criadoEm).getTime() + torneio.TTL_MS) / 1000);

    const embed = ui.warning(
        t('torneio.ja_existe'),
        t('torneio.ja_existe_texto', {
            nome: torneioDoc.nome,
            criador: torneioDoc.criadorId,
            quando: criadoEm
        })
    ).addFields(
        {
            name: t('torneio.situacao'),
            value: torneioDoc.fase === 'inscricoes' ? t('torneio.fase_inscricoes') : t('torneio.fase_executando'),
            inline: true
        },
        { name: t('torneio.inscritos'), value: `${inscritos} / ${torneioDoc.vagas}`, inline: true },
        { name: t('torneio.cancela_sozinho'), value: `<t:${expiraEm}:R>`, inline: true }
    );

    // Link direto para a mensagem do torneio, onde estão os botões.
    if (torneioDoc.canalId && torneioDoc.mensagemId) {
        embed.addFields({
            name: t('torneio.onde_fica'),
            value: t('torneio.ir_para_mensagem', {
                url: `https://discord.com/channels/${torneioDoc.guildId}/${torneioDoc.canalId}/${torneioDoc.mensagemId}`
            }),
            inline: false
        });
    }

    const componentes = [];
    if (podeAdministrar(interaction, torneioDoc)) {
        componentes.push(new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`tn_cancel_${torneioDoc.tournamentId}`)
                .setLabel(t('torneio.botao_cancelar_este'))
                .setEmoji('🗑️')
                .setStyle(ButtonStyle.Danger)
        ));
        embed.setFooter({ text: `${ui.BRAND} • ${t('torneio.rodape_devolve')}` });
    } else {
        embed.setFooter({ text: `${ui.BRAND} • ${t('torneio.rodape_so_criador')}` });
    }

    return interaction.reply({ embeds: [embed], components: componentes, flags: MessageFlags.Ephemeral });
}

async function torneioRun(client, interaction) {
    const t = await tDaInteracao(interaction);

    const recusar = (tituloChave, descricaoChave, valores) =>
        interaction.reply({
            embeds: [ui.error(t(tituloChave), t(descricaoChave, valores))],
            flags: MessageFlags.Ephemeral
        });

    if (!interaction.guildId) {
        return recusar('torneio.so_em_servidor', 'torneio.so_em_servidor_texto');
    }

    const existente = await torneio.ativoNoServidor(interaction.guildId);
    if (existente) {
        return avisarTorneioExistente(interaction, existente, t);
    }

    const nome = interaction.options.getString('name');
    const vagas = interaction.options.getInteger('slots') || 8;
    const taxa = interaction.options.getInteger('fee') || 0;

    if (!torneio.VAGAS_VALIDAS.includes(vagas)) {
        return recusar('torneio.vagas_invalidas', 'torneio.vagas_invalidas_texto', {
            opcoes: torneio.VAGAS_VALIDAS.join(', ')
        });
    }
    if (taxa > 0 && taxa < MIN_WAGER) {
        return recusar('torneio.inscricao_baixa', 'torneio.inscricao_baixa_texto', {
            minimo: ui.coins(MIN_WAGER, t.locale)
        });
    }

    // O quadro é público e duradouro: idioma do servidor. Ele também
    // define o nome padrão do torneio, que fica gravado no banco.
    const tQuadro = await tDoUsuario(null, interaction.guildId);

    const torneioDoc = await torneio.criar({
        guildId: interaction.guildId,
        canalId: interaction.channelId,
        criadorId: interaction.user.id,
        nome,
        taxaInscricao: taxa,
        vagas,
        locale: tQuadro.locale
    });

    await interaction.reply({
        embeds: [montarEmbedInscricoes(torneioDoc, tQuadro)],
        components: montarBotoes(torneioDoc, tQuadro)
    });
    const mensagem = await interaction.fetchReply();

    torneioDoc.mensagemId = mensagem.id;
    await torneioDoc.save();
}

module.exports = torneioRun;
module.exports.montarEmbedInscricoes = montarEmbedInscricoes;
module.exports.montarBotoes = montarBotoes;
module.exports.podeAdministrar = podeAdministrar;
