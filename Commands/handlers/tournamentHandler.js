const User = require('../utils/userSchema');
const ui = require('../utils/embeds');
const torneio = require('../utils/tournament');
const { verificarConquistas } = require('../utils/progresso');
const { anunciarConquistas } = require('../utils/notificacoes');
const { montarEmbedInscricoes, montarBotoes, podeAdministrar } = require('../actions/run/torneioRun');
const { MessageFlags } = require('discord.js');
const { tDaInteracao, tDoUsuario } = require('../utils/idioma');

/**
 * Botões do torneio: entrar, sair, começar, cancelar.
 *
 * customIds: tn_<acao>_<tournamentId>
 *
 * Dois idiomas em jogo aqui, de propósito (ver torneioRun.js):
 *   `t`       — de quem clicou, para as respostas privadas
 *   `tQuadro` — do servidor, para o quadro e o resultado, que são
 *               públicos e ficam no canal
 *
 * `torneioDoc` é o documento; `t` é o tradutor.
 */

/** Monta o embed com a chave completa, rodada por rodada. */
function montarEmbedResultado(torneioDoc, campeao, t) {
    const embed = ui.base(0xFFD700)
        .setTitle(t('torneio.resultado_titulo', { nome: torneioDoc.nome }))
        .setDescription(t('torneio.resultado_descricao', {
            campeao: campeao.id,
            n: torneioDoc.participantes.length
        }));

    for (const rodada of torneioDoc.rodadas) {
        // O número de participantes daquela rodada define o nome dela.
        const quantos = rodada.confrontos.length * 2;
        const linhas = rodada.confrontos.map((c) => {
            if (!c.bId) return `• ${t('torneio.passou_direto_linha', { id: c.aId })}`;
            const venceuA = c.vencedorId === c.aId;
            const placar = torneio.placarTexto(c.placar, t.locale);
            return venceuA
                ? `• **${c.aNome}** ✅ ${placar} ❌ ${c.bNome}`
                : `• ${c.aNome} ❌ ${placar} ✅ **${c.bNome}**`;
        }).join('\n');

        embed.addFields({
            name: torneio.nomeRodada(quantos, t.locale),
            value: linhas.slice(0, 1024),
            inline: false
        });
    }

    if (torneioDoc.premio > 0) {
        embed.addFields({
            name: t('torneio.premio'),
            value: t('torneio.premio_para', {
                valor: ui.coins(torneioDoc.premio, t.locale),
                campeao: campeao.id
            }),
            inline: false
        });
    }

    return embed;
}

async function handleTournament(client, interaction) {
    const id = interaction.customId;
    if (!id.startsWith('tn_')) return false;

    const partes = id.split('_');
    const acao = partes[1];
    const tournamentId = partes.slice(2).join('_');

    const t = await tDaInteracao(interaction);
    const tQuadro = await tDoUsuario(null, interaction.guildId);

    const torneioDoc = await torneio.buscar(tournamentId);
    if (!torneioDoc) {
        await interaction.reply({
            embeds: [ui.error(t('torneio.nao_encontrado'), t('torneio.nao_encontrado_texto'))],
            flags: MessageFlags.Ephemeral
        }).catch(() => {});
        return true;
    }

    // ---- Entrar ----
    if (acao === 'join') {
        const doc = await User.findOne({ id: interaction.user.id }).select('inventory').lean();
        const resultado = await torneio.inscrever(tournamentId, interaction.user, doc?.inventory || []);

        if (!resultado.ok) {
            const chaves = {
                FECHADO: 'torneio.erro_fechado',
                JA_INSCRITO: 'torneio.erro_ja_inscrito',
                LOTADO: 'torneio.erro_lotado',
                SEM_CARTAS: 'torneio.erro_sem_cartas',
                SEM_SALDO: 'torneio.erro_sem_saldo'
            };
            const chave = chaves[resultado.motivo];
            await interaction.reply({
                embeds: [ui.error(
                    t('torneio.nao_entrou'),
                    chave
                        ? t(chave, { valor: ui.coins(torneioDoc.taxaInscricao, t.locale) })
                        : t('torneio.erro_desconhecido')
                )],
                flags: MessageFlags.Ephemeral
            }).catch(() => {});
            return true;
        }

        const deckTexto = resultado.deck
            .map((c) => `${ui.getRarity(c.rarity, t.locale).emoji} **${ui.cardName(c.name, t.locale)}** — ${t('atributos.ovr')} ${c.overall}`)
            .join('\n');

        await interaction.update({
            embeds: [montarEmbedInscricoes(resultado.torneio, tQuadro)],
            components: montarBotoes(resultado.torneio, tQuadro)
        }).catch(() => {});

        await interaction.followUp({
            embeds: [ui.success(t('torneio.inscrito'), t('torneio.inscrito_texto', { deck: deckTexto }))
                .setFooter({ text: `${ui.BRAND} • ${t('torneio.rodape_melhores')}` })],
            flags: MessageFlags.Ephemeral
        }).catch(() => {});
        return true;
    }

    // ---- Sair ----
    if (acao === 'leave') {
        const resultado = await torneio.desinscrever(tournamentId, interaction.user.id);
        if (!resultado.ok) {
            await interaction.reply({
                embeds: [ui.error(t('torneio.nao_saiu'), resultado.motivo === 'NAO_INSCRITO'
                    ? t('torneio.erro_nao_inscrito')
                    : t('torneio.erro_fechado'))],
                flags: MessageFlags.Ephemeral
            }).catch(() => {});
            return true;
        }
        await interaction.update({
            embeds: [montarEmbedInscricoes(resultado.torneio, tQuadro)],
            components: montarBotoes(resultado.torneio, tQuadro)
        }).catch(() => {});
        return true;
    }

    // ---- Cancelar ----
    if (acao === 'cancel') {
        if (!podeAdministrar(interaction, torneioDoc)) {
            await interaction.reply({
                embeds: [ui.error(t('comum.sem_permissao'), t('torneio.so_criador_cancela'))],
                flags: MessageFlags.Ephemeral
            }).catch(() => {});
            return true;
        }

        await torneio.cancelar(tournamentId);

        // Este aviso substitui o quadro no canal, então segue o idioma
        // do servidor — não o de quem apertou o botão.
        const avisoCancelado = ui.neutral(
            tQuadro('torneio.cancelado'),
            torneioDoc.taxaInscricao > 0
                ? tQuadro('torneio.cancelado_com_devolucao', { nome: torneioDoc.nome })
                : tQuadro('torneio.cancelado_texto', { nome: torneioDoc.nome })
        );

        // O botão pode ter sido clicado em dois lugares: na mensagem
        // original do torneio, ou no aviso efêmero do /torneio. No segundo
        // caso, atualizar só a interação deixaria a mensagem original com
        // botões vivos de um torneio que não existe mais.
        const naMensagemOriginal = interaction.message?.id === torneioDoc.mensagemId;

        await interaction.update({
            embeds: [avisoCancelado],
            components: []
        }).catch(() => {});

        if (!naMensagemOriginal && torneioDoc.canalId && torneioDoc.mensagemId) {
            try {
                const canal = await client.channels.fetch(torneioDoc.canalId);
                const mensagem = await canal.messages.fetch(torneioDoc.mensagemId);
                await mensagem.edit({ embeds: [avisoCancelado], components: [] });
            } catch {
                // Mensagem apagada ou canal sem acesso: o torneio já foi
                // cancelado no banco, que é o que importa.
            }
        }
        return true;
    }

    // ---- Começar ----
    if (acao === 'start') {
        if (!podeAdministrar(interaction, torneioDoc)) {
            await interaction.reply({
                embeds: [ui.error(t('comum.sem_permissao'), t('torneio.so_criador_comeca'))],
                flags: MessageFlags.Ephemeral
            }).catch(() => {});
            return true;
        }

        await interaction.deferUpdate().catch(() => {});

        const resultado = await torneio.executar(tournamentId);
        if (!resultado.ok) {
            if (resultado.motivo === 'JA_EXECUTANDO') return true;
            await interaction.editReply({
                embeds: [ui.error(t('torneio.nao_comecou'), resultado.motivo === 'POUCOS'
                    ? t('torneio.erro_poucos')
                    : t('torneio.erro_iniciar'))],
                components: []
            }).catch(() => {});
            return true;
        }

        // A chave completa fica no canal para todo mundo ler.
        await interaction.editReply({
            embeds: [montarEmbedResultado(resultado.torneio, resultado.campeao, tQuadro)],
            components: []
        }).catch(() => {});

        // Conquista de campeão — anunciada no canal do torneio, no idioma
        // do campeão, porque a mensagem é sobre ele.
        const novas = await verificarConquistas(resultado.campeao.id);
        const tCampeao = await tDoUsuario(resultado.campeao.id, interaction.guildId);
        await anunciarConquistas(client, resultado.campeao.id, novas, interaction.channel, tCampeao.locale);
        return true;
    }

    return false;
}

module.exports = { handleTournament, montarEmbedResultado };
