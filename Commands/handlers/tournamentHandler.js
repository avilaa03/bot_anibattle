const User = require('../utils/userSchema');
const ui = require('../utils/embeds');
const tournament = require('../utils/tournament');
const { verificarConquistas } = require('../utils/progresso');
const { anunciarConquistas } = require('../utils/notificacoes');
const { montarEmbedInscricoes, montarBotoes, podeAdministrar } = require('../actions/run/tournamentRun');
const { MessageFlags } = require('discord.js');
const { tDaInteracao, tDoUsuario } = require('../utils/idioma');

/**
 * Botões do torneio: entrar, sair, começar, cancelar.
 *
 * customIds: tn_<acao>_<tournamentId>
 *
 * ## Duas vozes
 *
 * O QUADRO do torneio segue o idioma do servidor: ele fica horas no canal,
 * é editado a cada inscrição e é lido por todo mundo. Se seguisse o
 * clique, trocaria de idioma a cada pessoa que entrasse.
 *
 * As respostas efêmeras — "você já está inscrito", o time sorteado —
 * seguem quem clicou, porque só aquela pessoa as vê.
 */

/** Monta o embed com a chave completa, rodada por rodada. */
function montarEmbedResultado(torneio, campeao, t) {
    const embed = ui.base(0xFFD700)
        .setTitle(t('torneio.resultado_titulo', { nome: torneio.nome }))
        .setDescription(t('torneio.resultado_descricao', {
            campeao: campeao.id,
            n: torneio.participantes.length
        }));

    for (const rodada of torneio.rodadas) {
        // O número de participantes daquela rodada define o nome dela.
        const quantos = rodada.confrontos.length * 2;
        const linhas = rodada.confrontos.map((c) => {
            if (!c.bId) return `• ${t('torneio.passou_direto_linha', { id: c.aId })}`;
            const venceuA = c.vencedorId === c.aId;
            return venceuA
                ? `• **${c.aNome}** ✅ ${c.placar} ❌ ${c.bNome}`
                : `• ${c.aNome} ❌ ${c.placar} ✅ **${c.bNome}**`;
        }).join('\n');

        embed.addFields({
            name: tournament.nomeRodada(quantos, t.locale),
            value: linhas.slice(0, 1024),
            inline: false
        });
    }

    if (torneio.premio > 0) {
        embed.addFields({
            name: t('torneio.premio'),
            value: t('torneio.premio_para', {
                valor: ui.coins(torneio.premio, t.locale),
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

    const torneio = await tournament.buscar(tournamentId);
    if (!torneio) {
        await interaction.reply({
            embeds: [ui.error(t('torneio.nao_encontrado'), t('torneio.nao_encontrado_texto'))],
            flags: MessageFlags.Ephemeral
        }).catch(() => {});
        return true;
    }

    // ---- Entrar ----
    if (acao === 'join') {
        const doc = await User.findOne({ id: interaction.user.id }).select('inventory').lean();
        const resultado = await tournament.inscrever(tournamentId, interaction.user, doc?.inventory || []);

        if (!resultado.ok) {
            // O motivo é código; a frase sai do dicionário. Motivo novo sem
            // texto aparece como a própria chave, que é feio o bastante
            // para ser achado antes de chegar ao jogador.
            const CHAVES = {
                FECHADO: 'torneio.erro_fechado',
                JA_INSCRITO: 'torneio.erro_ja_inscrito',
                LOTADO: 'torneio.erro_lotado',
                SEM_CARTAS: 'torneio.erro_sem_cartas',
                SEM_SALDO: 'torneio.erro_sem_saldo'
            };
            const chave = CHAVES[resultado.motivo] || 'torneio.erro_desconhecido';
            await interaction.reply({
                embeds: [ui.error(
                    t('torneio.nao_entrou'),
                    t(chave, { valor: ui.coins(torneio.taxaInscricao, t.locale) })
                )],
                flags: MessageFlags.Ephemeral
            }).catch(() => {});
            return true;
        }

        const deckTexto = resultado.deck
            .map((c) => `${ui.getRarity(c.rarity, t.locale).emoji} **${ui.cardName(c)}** — ${t('atributos.ovr')} ${c.overall}`)
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
        const resultado = await tournament.desinscrever(tournamentId, interaction.user.id);
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
        if (!podeAdministrar(interaction, torneio)) {
            await interaction.reply({
                embeds: [ui.error(t('comum.sem_permissao'), t('torneio.so_criador_cancela'))],
                flags: MessageFlags.Ephemeral
            }).catch(() => {});
            return true;
        }

        await tournament.cancelar(tournamentId);

        // O aviso substitui o quadro no canal, então segue o servidor.
        const avisoCancelado = ui.neutral(
            tQuadro('torneio.cancelado'),
            torneio.taxaInscricao > 0
                ? tQuadro('torneio.cancelado_com_devolucao', { nome: torneio.nome })
                : tQuadro('torneio.cancelado_texto', { nome: torneio.nome })
        );

        // O botão pode ter sido clicado em dois lugares: na mensagem
        // original do torneio, ou no aviso efêmero do /torneio. No segundo
        // caso, atualizar só a interação deixaria a mensagem original com
        // botões vivos de um torneio que não existe mais.
        const naMensagemOriginal = interaction.message?.id === torneio.mensagemId;

        await interaction.update({
            embeds: [avisoCancelado],
            components: []
        }).catch(() => {});

        if (!naMensagemOriginal && torneio.canalId && torneio.mensagemId) {
            try {
                const canal = await client.channels.fetch(torneio.canalId);
                const mensagem = await canal.messages.fetch(torneio.mensagemId);
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
        if (!podeAdministrar(interaction, torneio)) {
            await interaction.reply({
                embeds: [ui.error(t('comum.sem_permissao'), t('torneio.so_criador_comeca'))],
                flags: MessageFlags.Ephemeral
            }).catch(() => {});
            return true;
        }

        await interaction.deferUpdate().catch(() => {});

        const resultado = await tournament.executar(tournamentId);
        if (!resultado.ok) {
            if (resultado.motivo === 'JA_EXECUTANDO') return true;
            await interaction.editReply({
                embeds: [ui.error(tQuadro('torneio.nao_comecou'), resultado.motivo === 'POUCOS'
                    ? tQuadro('torneio.erro_poucos')
                    : tQuadro('torneio.erro_iniciar'))],
                components: []
            }).catch(() => {});
            return true;
        }

        // A chave final fica no canal para todo mundo ver: idioma do servidor.
        await interaction.editReply({
            embeds: [montarEmbedResultado(resultado.torneio, resultado.campeao, tQuadro)],
            components: []
        }).catch(() => {});

        // Conquista de campeão — anunciada no canal do torneio.
        const novas = await verificarConquistas(resultado.campeao.id);
        await anunciarConquistas(client, resultado.campeao.id, novas, interaction.channel);
        return true;
    }

    return false;
}

module.exports = { handleTournament, montarEmbedResultado };
