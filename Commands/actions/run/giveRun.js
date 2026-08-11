const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const User = require('../../utils/userSchema');
const ui = require('../../utils/embeds');
const { trySpend, addBalance } = require('../../utils/economy');
const { tDaInteracao } = require('../../utils/language');

async function giveRun(client, interaction) {
    const t = await tDaInteracao(interaction);
    const amount = Math.floor(interaction.options.getNumber('amount'));
    const recipient = interaction.options.getUser('user');
    const senderId = interaction.user.id;

    const recusar = (tituloChave, descricaoChave, valores) =>
        interaction.reply({
            embeds: [ui.error(t(tituloChave), t(descricaoChave, valores))],
            flags: MessageFlags.Ephemeral
        });

    try {
        if (recipient.id === senderId) {
            return recusar('give.destinatario_invalido', 'give.si_mesmo');
        }
        if (recipient.bot) {
            return recusar('give.destinatario_invalido', 'give.bot');
        }
        if (!Number.isFinite(amount) || amount <= 0) {
            return recusar('give.valor_invalido', 'give.valor_invalido_texto');
        }

        const senderUser = await User.findOne({ id: senderId });
        if (!senderUser || (senderUser.balance || 0) < amount) {
            return recusar('comum.saldo_insuficiente', 'give.sem_saldo', {
                saldo: ui.coins(senderUser?.balance || 0, t.locale),
                precisa: ui.coins(amount, t.locale)
            });
        }

        const embed = ui.warning(
            t('give.confirmar_titulo'),
            t('give.confirmar_texto', { valor: ui.coins(amount, t.locale), jogador: recipient.username })
        )
            .addFields(
                { name: t('give.saldo_agora'), value: ui.coins(senderUser.balance, t.locale), inline: true },
                { name: t('give.saldo_depois'), value: ui.coins(senderUser.balance - amount, t.locale), inline: true }
            )
            .setFooter({ text: `${ui.BRAND} • ${t('give.rodape_prazo')}` });

        const botoes = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('give_confirm').setLabel(t('comum.confirmar')).setEmoji('💸').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('give_cancel').setLabel(t('comum.cancelar')).setStyle(ButtonStyle.Secondary)
        );

        await interaction.reply({ embeds: [embed], components: [botoes] });
        const mensagem = await interaction.fetchReply();

        // Antes isto era um coletor de mensagens ("digite confirmar"), o que
        // obrigava o bot a usar o intent privilegiado MessageContent. Com
        // botões, o intent deixa de ser necessário.
        const filtro = (i) => ['give_confirm', 'give_cancel'].includes(i.customId) && i.user.id === senderId;
        const coletor = mensagem.createMessageComponentCollector({ filter: filtro, time: 30000, max: 1 });

        coletor.on('collect', async (i) => {
            if (i.customId === 'give_cancel') {
                return i.update({
                    embeds: [ui.neutral(t('give.cancelada'), t('give.cancelada_texto'))],
                    components: []
                });
            }

            const debitado = await trySpend(senderId, amount);
            if (!debitado) {
                return i.update({
                    embeds: [ui.error(t('comum.saldo_insuficiente'), t('give.saldo_mudou'))],
                    components: []
                });
            }

            const destino = await addBalance(recipient.id, amount);
            const sucesso = ui.success(
                t('give.concluida'),
                t('give.concluida_texto', { valor: ui.coins(amount, t.locale), id: recipient.id })
            )
                .addFields(
                    { name: t('give.seu_saldo'), value: ui.coins(debitado.balance, t.locale), inline: true },
                    { name: t('give.saldo_destinatario'), value: ui.coins(destino?.balance ?? 0, t.locale), inline: true }
                );
            return i.update({ embeds: [sucesso], components: [] });
        });

        coletor.on('end', (coletadas, motivo) => {
            if (motivo === 'time' && coletadas.size === 0) {
                mensagem.edit({
                    embeds: [ui.neutral(t('comum.tempo_esgotado'), t('give.expirou'))],
                    components: []
                }).catch(() => {});
            }
        });
    } catch (err) {
        console.error('Erro ao executar o comando give:', err);
        const embed = ui.error(t('comum.erro'), t('give.erro'));
        if (interaction.replied || interaction.deferred) {
            interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral }).catch(() => {});
        } else {
            interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral }).catch(() => {});
        }
    }
}

module.exports = { giveRun };
