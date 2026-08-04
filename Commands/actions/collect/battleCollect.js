const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { createBattle, generateBattleId, cancelBattle, setMessageRefs } = require('../../utils/battleState');
const { trySpend, addBalance } = require('../../utils/economy');
const ui = require('../../utils/embeds');

// 20, não 25.
//
// O Discord permite 5 linhas de 5 botões numa mensagem. Com 25 cartas as
// cinco linhas ficavam lotadas e não sobrava espaço para o botão de
// desistir — ele simplesmente não aparecia, sem erro nenhum.
//
// 20 cartas deixam a quinta linha livre. Para escolher 3 do time, ver as
// 20 melhores é mais que suficiente.
const MAX_CARDS_SHOWN = 20;
const CARDS_PER_ROW = 5;

// Limites do Discord, usados na montagem dos botões.
const MAX_LINHAS = 5;
const MAX_BOTOES_POR_LINHA = 5;

function getOvr(card) {
    return card.overall ?? (card.marketValue != null ? Math.round(card.marketValue / 10) : 0);
}

/**
 * Ordena o inventário das melhores cartas para as piores. Como só cabem 25
 * botões, sem isso quem tem 200 cartas nunca conseguiria usar as melhores
 * — elas ficariam fora da janela visível.
 */
function ordenarParaBatalha(inventory) {
    return [...inventory].sort((a, b) => {
        const porRaridade = ui.compareRarityDesc(a.rarity, b.rarity);
        return porRaridade !== 0 ? porRaridade : getOvr(b) - getOvr(a);
    });
}

function buildDeckChoiceMessage(battleId, side, inventory, selectedIds, deck, wager = 0) {
    const selecionadas = new Set((selectedIds || []).map(String));
    const completo = deck.length === 3;

    const embed = ui.base(completo ? ui.STATUS_COLORS.success : ui.STATUS_COLORS.warning)
        .setTitle('⚔️ Monte seu time')
        .setDescription(
            completo
                ? '✅ **Time completo!** Aguardando seu oponente escolher...'
                : [
                    'Escolha **3 cartas** para batalhar.',
                    '',
                    `${'🔵'.repeat(deck.length)}${'⚪'.repeat(3 - deck.length)}  **${deck.length}/3**`,
                    '',
                    '💡 *A ordem importa: sua 1ª carta enfrenta a 1ª do oponente, a 2ª contra a 2ª, e assim por diante.*'
                ].join('\n')
        );

    if (wager > 0) {
        embed.addFields({ name: '💰 Em jogo', value: `${ui.coins(wager * 2)} — o vencedor leva tudo`, inline: false });
    }

    if (deck.length > 0) {
        embed.addFields({
            name: 'Seu time',
            value: deck.map((c, i) => {
                const meta = ui.getRarity(c.rarity);
                return `\`${i + 1}\` ${meta.emoji} **${ui.cardName(c.name)}** — OVR ${getOvr(c)}\n└ ⚔️ ${c.ATA ?? 0} · ❤️ ${c.LIF ?? 0} · 💥 ${c.POW ?? 0}`;
            }).join('\n')
        });
    }

    const cardsToShow = ordenarParaBatalha(inventory).slice(0, MAX_CARDS_SHOWN);

    if (inventory.length > MAX_CARDS_SHOWN) {
        embed.setFooter({ text: `${ui.BRAND} • Mostrando suas ${MAX_CARDS_SHOWN} melhores cartas de ${inventory.length}` });
    }

    const rows = [];
    for (let row = 0; row < Math.ceil(cardsToShow.length / CARDS_PER_ROW); row++) {
        const actionRow = new ActionRowBuilder();
        for (let col = 0; col < CARDS_PER_ROW; col++) {
            const index = row * CARDS_PER_ROW + col;
            if (index >= cardsToShow.length) break;
            const card = cardsToShow[index];
            const cardId = String(card._id);
            const isSelected = selecionadas.has(cardId);
            const meta = ui.getRarity(card.rarity);
            const nomeCurto = card.name.length > 60 ? card.name.slice(0, 57) + '…' : card.name;
            const label = `${nomeCurto} · ${getOvr(card)}`;
            actionRow.addComponents(
                new ButtonBuilder()
                    // O customId carrega o _id da carta, não o índice: assim a
                    // escolha não "escorrega" se o inventário mudar no meio.
                    .setCustomId(`battle_pick_${battleId}_${side}_${cardId}`)
                    .setLabel(label.slice(0, 80))
                    .setEmoji(meta.emoji)
                    .setStyle(isSelected ? ButtonStyle.Success : ButtonStyle.Secondary)
                    .setDisabled(isSelected)
            );
        }
        rows.push(actionRow);
    }

    // Saída durante a escolha do time.
    //
    // Sem isso, quem desafiava e via o oponente sumir ficava com a aposta
    // retida até a varredura passar. Cancelar aqui devolve a aposta aos
    // dois na hora — o `wagerHeld` do battleState existe justamente para
    // isso saber quando devolver.
    //
    // Entra na última linha se couber; senão abre uma linha nova. Com
    // MAX_CARDS_SHOWN em 20 sempre sobra espaço, mas a conta fica aqui
    // para o botão não sumir em silêncio se alguém mexer nas constantes.
    const botaoDesistir = new ButtonBuilder()
        .setCustomId(`battle_cancel_${battleId}`)
        .setLabel('Desistir')
        .setEmoji('🚫')
        .setStyle(ButtonStyle.Danger);

    const ultima = rows[rows.length - 1];
    if (ultima && ultima.components.length < MAX_BOTOES_POR_LINHA) {
        ultima.addComponents(botaoDesistir);
    } else if (rows.length < MAX_LINHAS) {
        rows.push(new ActionRowBuilder().addComponents(botaoDesistir));
    } else {
        // Não deveria acontecer. Se acontecer, é erro de configuração e
        // precisa gritar — botão de desistir sumido deixa aposta presa.
        console.error(
            '[battleCollect] Sem espaço para o botão de desistir. '
            + `MAX_CARDS_SHOWN (${MAX_CARDS_SHOWN}) ocupa todas as ${MAX_LINHAS} linhas do Discord.`
        );
    }

    return { embed, components: rows };
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
