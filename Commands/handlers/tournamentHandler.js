const User = require('../utils/userSchema');
const ui = require('../utils/embeds');
const torneio = require('../utils/tournament');
const { verificarConquistas } = require('../utils/progresso');
const { anunciarConquistas } = require('../utils/notificacoes');
const { montarEmbedInscricoes, montarBotoes, podeAdministrar } = require('../actions/run/torneioRun');
const { MessageFlags } = require('discord.js');

/**
 * Botões do torneio: entrar, sair, começar, cancelar.
 *
 * customIds: tn_<acao>_<tournamentId>
 */

/** Monta o embed com a chave completa, rodada por rodada. */
function montarEmbedResultado(t, campeao) {
    const embed = ui.base(0xFFD700)
        .setTitle(`🏆 ${t.nome} — Resultado`)
        .setDescription(`👑 Campeão: <@${campeao.id}>\n\n${t.participantes.length} participante(s)`);

    for (const rodada of t.rodadas) {
        // O número de participantes daquela rodada define o nome dela.
        const quantos = rodada.confrontos.length * 2;
        const linhas = rodada.confrontos.map((c) => {
            if (!c.bId) return `• <@${c.aId}> passou direto`;
            const venceuA = c.vencedorId === c.aId;
            return venceuA
                ? `• **${c.aNome}** ✅ ${c.placar} ❌ ${c.bNome}`
                : `• ${c.aNome} ❌ ${c.placar} ✅ **${c.bNome}**`;
        }).join('\n');

        embed.addFields({
            name: torneio.nomeRodada(quantos),
            value: linhas.slice(0, 1024),
            inline: false
        });
    }

    if (t.premio > 0) {
        embed.addFields({ name: '🏅 Prêmio', value: `${ui.coins(t.premio)} para <@${campeao.id}>`, inline: false });
    }

    return embed;
}

async function handleTournament(client, interaction) {
    const id = interaction.customId;
    if (!id.startsWith('tn_')) return false;

    const partes = id.split('_');
    const acao = partes[1];
    const tournamentId = partes.slice(2).join('_');

    const t = await torneio.buscar(tournamentId);
    if (!t) {
        await interaction.reply({
            embeds: [ui.error('Torneio não encontrado', 'Esse torneio não existe mais.')],
            flags: MessageFlags.Ephemeral
        }).catch(() => {});
        return true;
    }

    // ---- Entrar ----
    if (acao === 'join') {
        const doc = await User.findOne({ id: interaction.user.id }).select('inventory').lean();
        const resultado = await torneio.inscrever(tournamentId, interaction.user, doc?.inventory || []);

        if (!resultado.ok) {
            const mensagens = {
                FECHADO: 'As inscrições já foram encerradas.',
                JA_INSCRITO: 'Você já está inscrito neste torneio.',
                LOTADO: 'Todas as vagas foram preenchidas.',
                SEM_CARTAS: 'Você precisa de pelo menos **3 cartas** para participar. Use `/roll`.',
                SEM_SALDO: `Você não tem ${ui.coins(t.taxaInscricao)} para pagar a inscrição.`
            };
            await interaction.reply({
                embeds: [ui.error('Não deu para entrar', mensagens[resultado.motivo] || 'Erro desconhecido.')],
                flags: MessageFlags.Ephemeral
            }).catch(() => {});
            return true;
        }

        const deckTexto = resultado.deck
            .map((c) => `${ui.getRarity(c.rarity).emoji} **${ui.cardName(c)}** — OVR ${c.overall}`)
            .join('\n');

        await interaction.update({
            embeds: [montarEmbedInscricoes(resultado.torneio)],
            components: montarBotoes(resultado.torneio)
        }).catch(() => {});

        await interaction.followUp({
            embeds: [ui.success('Inscrito!', `Seu time no torneio:\n\n${deckTexto}`)
                .setFooter({ text: `${ui.BRAND} • Suas 3 melhores cartas foram escolhidas automaticamente` })],
            flags: MessageFlags.Ephemeral
        }).catch(() => {});
        return true;
    }

    // ---- Sair ----
    if (acao === 'leave') {
        const resultado = await torneio.desinscrever(tournamentId, interaction.user.id);
        if (!resultado.ok) {
            await interaction.reply({
                embeds: [ui.error('Não deu para sair', resultado.motivo === 'NAO_INSCRITO'
                    ? 'Você não está inscrito neste torneio.'
                    : 'As inscrições já foram encerradas.')],
                flags: MessageFlags.Ephemeral
            }).catch(() => {});
            return true;
        }
        await interaction.update({
            embeds: [montarEmbedInscricoes(resultado.torneio)],
            components: montarBotoes(resultado.torneio)
        }).catch(() => {});
        return true;
    }

    // ---- Cancelar ----
    if (acao === 'cancel') {
        if (!podeAdministrar(interaction, t)) {
            await interaction.reply({
                embeds: [ui.error(
                    'Sem permissão',
                    'Só quem criou o torneio pode cancelar. Se você entrou e quer desistir, use o botão **Sair**.'
                )],
                flags: MessageFlags.Ephemeral
            }).catch(() => {});
            return true;
        }

        await torneio.cancelar(tournamentId);

        const avisoCancelado = ui.neutral(
            'Torneio cancelado',
            t.taxaInscricao > 0
                ? `**${t.nome}** foi cancelado e as inscrições foram devolvidas.`
                : `**${t.nome}** foi cancelado.`
        );

        // O botão pode ter sido clicado em dois lugares: na mensagem
        // original do torneio, ou no aviso efêmero do /torneio. No segundo
        // caso, atualizar só a interação deixaria a mensagem original com
        // botões vivos de um torneio que não existe mais.
        const naMensagemOriginal = interaction.message?.id === t.mensagemId;

        await interaction.update({
            embeds: [avisoCancelado],
            components: []
        }).catch(() => {});

        if (!naMensagemOriginal && t.canalId && t.mensagemId) {
            try {
                const canal = await client.channels.fetch(t.canalId);
                const mensagem = await canal.messages.fetch(t.mensagemId);
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
        if (!podeAdministrar(interaction, t)) {
            await interaction.reply({
                embeds: [ui.error('Sem permissão', 'Só quem criou o torneio pode começar.')],
                flags: MessageFlags.Ephemeral
            }).catch(() => {});
            return true;
        }

        await interaction.deferUpdate().catch(() => {});

        const resultado = await torneio.executar(tournamentId);
        if (!resultado.ok) {
            if (resultado.motivo === 'JA_EXECUTANDO') return true;
            await interaction.editReply({
                embeds: [ui.error('Não deu para começar', resultado.motivo === 'POUCOS'
                    ? 'É preciso pelo menos 2 participantes. As inscrições foram devolvidas.'
                    : 'Erro ao iniciar o torneio.')],
                components: []
            }).catch(() => {});
            return true;
        }

        await interaction.editReply({
            embeds: [montarEmbedResultado(resultado.torneio, resultado.campeao)],
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
