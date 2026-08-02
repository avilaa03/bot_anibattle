const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const User = require('../../utils/userSchema');
const ui = require('../../utils/embeds');
const { trySpend, addBalance } = require('../../utils/economy');

async function giveRun(client, interaction) {
    const amount = Math.floor(interaction.options.getNumber('amount'));
    const recipient = interaction.options.getUser('user');
    const senderId = interaction.user.id;

    const recusar = (titulo, descricao) =>
        interaction.reply({ embeds: [ui.error(titulo, descricao)], ephemeral: true });

    try {
        if (recipient.id === senderId) {
            return recusar('Destinatário inválido', 'Você não pode transferir moedas para si mesmo.');
        }
        if (recipient.bot) {
            return recusar('Destinatário inválido', 'Bots não recebem moedas.');
        }
        if (!Number.isFinite(amount) || amount <= 0) {
            return recusar('Valor inválido', 'Informe uma quantia maior que zero.');
        }

        const senderUser = await User.findOne({ id: senderId });
        if (!senderUser || (senderUser.balance || 0) < amount) {
            return recusar('Saldo insuficiente', `Você tem ${ui.coins(senderUser?.balance || 0)} e precisa de ${ui.coins(amount)}.`);
        }

        const embed = ui.warning('Confirmar transferência', `Você vai enviar ${ui.coins(amount)} para **${recipient.username}**.`)
            .addFields(
                { name: 'Seu saldo agora', value: ui.coins(senderUser.balance), inline: true },
                { name: 'Depois da transferência', value: ui.coins(senderUser.balance - amount), inline: true }
            )
            .setFooter({ text: `${ui.BRAND} • Você tem 30 segundos para confirmar` });

        const botoes = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('give_confirm').setLabel('Confirmar').setEmoji('💸').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('give_cancel').setLabel('Cancelar').setStyle(ButtonStyle.Secondary)
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
                    embeds: [ui.neutral('Transferência cancelada', 'Nenhuma moeda foi movida.')],
                    components: []
                });
            }

            const debitado = await trySpend(senderId, amount);
            if (!debitado) {
                return i.update({
                    embeds: [ui.error('Saldo insuficiente', 'Seu saldo mudou e não dá mais para completar essa transferência.')],
                    components: []
                });
            }

            const destino = await addBalance(recipient.id, amount);
            const sucesso = ui.success('Transferência concluída', `${ui.coins(amount)} enviadas para <@${recipient.id}>.`)
                .addFields(
                    { name: 'Seu saldo', value: ui.coins(debitado.balance), inline: true },
                    { name: 'Saldo do destinatário', value: ui.coins(destino?.balance ?? 0), inline: true }
                );
            return i.update({ embeds: [sucesso], components: [] });
        });

        coletor.on('end', (coletadas, motivo) => {
            if (motivo === 'time' && coletadas.size === 0) {
                mensagem.edit({
                    embeds: [ui.neutral('Tempo esgotado', 'A transferência foi cancelada porque você não confirmou a tempo.')],
                    components: []
                }).catch(() => {});
            }
        });
    } catch (err) {
        console.error('Erro ao executar o comando give:', err);
        const embed = ui.error('Erro', 'Houve um erro ao executar a transferência.');
        if (interaction.replied || interaction.deferred) {
            interaction.followUp({ embeds: [embed], ephemeral: true }).catch(() => {});
        } else {
            interaction.reply({ embeds: [embed], ephemeral: true }).catch(() => {});
        }
    }
}

module.exports = { giveRun };
