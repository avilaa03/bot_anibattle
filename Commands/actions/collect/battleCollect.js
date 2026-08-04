const { createBattle, generateBattleId, cancelBattle, setMessageRefs } = require('../../utils/battleState');
const { trySpend, addBalance } = require('../../utils/economy');
const ui = require('../../utils/embeds');
const { montarEscolhaDeTime, ordenarParaBatalha } = require('../../utils/escolhaDeTime');

/**
 * Tela de escolha de time do `/battle`.
 *
 * A montagem em si mora em `utils/escolhaDeTime.js`, compartilhada com o
 * `/treino` — as duas telas são a mesma coisa e precisam continuar
 * iguais. O que fica aqui é só o que é específico da batalha valendo
 * aposta: o nome dos customId e o campo do valor em jogo.
 */
function buildDeckChoiceMessage(battleId, side, inventory, selectedIds, deck, wager = 0) {
    const campos = wager > 0
        ? [{ name: '💰 Em jogo', value: `${ui.coins(wager * 2)} — o vencedor leva tudo`, inline: false }]
        : [];

    return montarEscolhaDeTime({
        inventory,
        selectedIds,
        deck,
        idEscolha: (cardId) => `battle_pick_${battleId}_${side}_${cardId}`,
        idCancelar: `battle_cancel_${battleId}`,
        rotuloCancelar: 'Desistir',
        aguardando: '✅ **Time completo!** Aguardando seu oponente escolher...',
        campos
    });
}

async function battleCollect(interaction, userX, userY, userXData, userYData, challengeMessage, wager = 0) {
    const filter = (i) => ['accept_battle', 'decline_battle'].includes(i.customId) && i.user.id === userY.id;
    const collector = challengeMessage.createMessageComponentCollector({ filter, time: 60000, max: 1 });

    collector.on('collect', async (i) => {
        if (i.customId === 'decline_battle') {
            await i.update({
                content: null,
                embeds: [ui.neutral('Desafio recusado', `**${userY.username}** recusou o duelo.`)],
                components: []
            });
            return;
        }

        // Cobra a aposta dos dois lados agora (escrow). Se qualquer um dos
        // débitos falhar, devolve o que já foi cobrado e cancela.
        const debitoX = await trySpend(userX.id, wager);
        if (!debitoX) {
            await i.update({
                content: null,
                embeds: [ui.error('Aposta não cobrada', `**${userX.username}** não tem mais ${ui.coins(wager)} disponíveis.`)],
                components: []
            });
            return;
        }

        const debitoY = await trySpend(userY.id, wager);
        if (!debitoY) {
            await addBalance(userX.id, wager); // devolve
            await i.update({
                content: null,
                embeds: [ui.error('Aposta não cobrada', `**${userY.username}** não tem mais ${ui.coins(wager)} disponíveis.`)],
                components: []
            });
            return;
        }

        const battleId = generateBattleId();
        await createBattle(battleId, userX, userY, interaction.channelId, wager);

        await i.update({
            content: null,
            embeds: [ui.success('Duelo aceito!', `**${userY.username}** topou. ${ui.coins(wager * 2)} em jogo.\n\nOs dois receberam no privado a tela para montar o time.`)],
            components: []
        });

        const msgXContent = buildDeckChoiceMessage(battleId, 'X', userXData.inventory, [], [], wager);
        const msgYContent = buildDeckChoiceMessage(battleId, 'Y', userYData.inventory, [], [], wager);

        try {
            const msgX = await userX.send({
                content: `Você está batalhando contra **${userY.username}**!`,
                embeds: [msgXContent.embed],
                components: msgXContent.components
            });
            await setMessageRefs(battleId, 'X', msgX.id, msgX.channel.id);

            const msgY = await userY.send({
                content: `Você está batalhando contra **${userX.username}**!`,
                embeds: [msgYContent.embed],
                components: msgYContent.components
            });
            await setMessageRefs(battleId, 'Y', msgY.id, msgY.channel.id);
        } catch (err) {
            console.error('Erro ao enviar DM da batalha:', err);
            // Não conseguiu abrir o privado: cancela devolvendo as apostas.
            await cancelBattle(battleId);
            await interaction.followUp({
                embeds: [ui.error('Não foi possível iniciar', 'Não consegui enviar mensagem no privado de um dos jogadores. Habilitem mensagens diretas do servidor.\n\nAs apostas foram devolvidas.')]
            }).catch(() => {});
        }
    });

    return collector;
}

module.exports = { battleCollect, buildDeckChoiceMessage, ordenarParaBatalha };
