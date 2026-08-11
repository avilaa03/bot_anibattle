const { createBattle, generateBattleId, cancelBattle, setMessageRefs } = require('../../utils/battleState');
const { trySpend, addBalance } = require('../../utils/economy');
const ui = require('../../utils/embeds');
const { montarEscolhaDeTime, ordenarParaBatalha } = require('../../utils/teamPicker');
const { criarT, DEFAULT_LOCALE } = require('../../utils/i18n');
const { tDoUsuario } = require('../../utils/language');

/**
 * Tela de escolha de time do `/battle`.
 *
 * A montagem em si mora em `utils/escolhaDeTime.js`, compartilhada com o
 * `/treino` — as duas telas são a mesma coisa e precisam continuar
 * iguais. O que fica aqui é só o que é específico da batalha valendo
 * aposta: o nome dos customId e o campo do valor em jogo.
 */
function buildDeckChoiceMessage(battleId, side, inventory, selectedIds, deck, wager = 0, t = criarT(DEFAULT_LOCALE)) {
    const campos = wager > 0
        ? [{
            name: t('battle.em_jogo'),
            value: t('battle.em_jogo_texto', { valor: ui.coins(wager * 2, t.locale) }),
            inline: false
        }]
        : [];

    return montarEscolhaDeTime({
        inventory,
        selectedIds,
        deck,
        idEscolha: (cardId) => `battle_pick_${battleId}_${side}_${cardId}`,
        idCancelar: `battle_cancel_${battleId}`,
        campos,
        t
    });
}

/**
 * @param {object} tDesafio tradutor do idioma da mensagem do desafio, que
 *   é pública e fica no canal — vem pronto do `battleRun`.
 */
async function battleCollect(interaction, userX, userY, userXData, userYData, challengeMessage, wager = 0, tDesafio) {
    const filter = (i) => ['accept_battle', 'decline_battle'].includes(i.customId) && i.user.id === userY.id;
    const collector = challengeMessage.createMessageComponentCollector({ filter, time: 60000, max: 1 });

    const t = tDesafio ?? criarT(DEFAULT_LOCALE);

    collector.on('collect', async (i) => {
        if (i.customId === 'decline_battle') {
            await i.update({
                content: null,
                embeds: [ui.neutral(t('battle.recusado'), t('battle.recusado_texto', { jogador: userY.username }))],
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
                embeds: [ui.error(t('battle.aposta_nao_cobrada'), t('battle.sem_saldo_jogador', {
                    jogador: userX.username,
                    valor: ui.coins(wager, t.locale)
                }))],
                components: []
            });
            return;
        }

        const debitoY = await trySpend(userY.id, wager);
        if (!debitoY) {
            await addBalance(userX.id, wager); // devolve
            await i.update({
                content: null,
                embeds: [ui.error(t('battle.aposta_nao_cobrada'), t('battle.sem_saldo_jogador', {
                    jogador: userY.username,
                    valor: ui.coins(wager, t.locale)
                }))],
                components: []
            });
            return;
        }

        const battleId = generateBattleId();
        await createBattle(battleId, userX, userY, interaction.channelId, wager);

        await i.update({
            content: null,
            embeds: [ui.success(t('battle.aceito'), t('battle.aceito_texto', {
                jogador: userY.username,
                valor: ui.coins(wager * 2, t.locale)
            }))],
            components: []
        });

        // A tela de montar o time vai para o privado de CADA jogador, então
        // cada uma sai no idioma do dono — não no de quem clicou em aceitar.
        const [tX, tY] = await Promise.all([
            tDoUsuario(userX.id, interaction.guildId),
            tDoUsuario(userY.id, interaction.guildId)
        ]);

        const msgXContent = buildDeckChoiceMessage(battleId, 'X', userXData.inventory, [], [], wager, tX);
        const msgYContent = buildDeckChoiceMessage(battleId, 'Y', userYData.inventory, [], [], wager, tY);

        try {
            const msgX = await userX.send({
                content: tX('battle.dm_contra', { oponente: userY.username }),
                embeds: [msgXContent.embed],
                components: msgXContent.components
            });
            await setMessageRefs(battleId, 'X', msgX.id, msgX.channel.id);

            const msgY = await userY.send({
                content: tY('battle.dm_contra', { oponente: userX.username }),
                embeds: [msgYContent.embed],
                components: msgYContent.components
            });
            await setMessageRefs(battleId, 'Y', msgY.id, msgY.channel.id);
        } catch (err) {
            console.error('Erro ao enviar DM da batalha:', err);
            // Não conseguiu abrir o privado: cancela devolvendo as apostas.
            await cancelBattle(battleId);
            await interaction.followUp({
                embeds: [ui.error(t('battle.nao_iniciou'), t('battle.nao_iniciou_texto'))]
            }).catch(() => {});
        }
    });

    return collector;
}

module.exports = { battleCollect, buildDeckChoiceMessage, ordenarParaBatalha };
