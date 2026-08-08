const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { createBattle, generateBattleId, cancelBattle, setMessageRefs } = require('../../utils/battleState');
const { trySpend, addBalance } = require('../../utils/economy');
const ui = require('../../utils/embeds');
const { criarT, DEFAULT_LOCALE } = require('../../utils/i18n');
const { tDoUsuario } = require('../../utils/idioma');

const MAX_CARDS_SHOWN = 25;
const CARDS_PER_ROW = 5;

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

/**
 * Tela de montar o time, enviada no privado de cada jogador.
 *
 * O `t` vem de fora e é o do DONO desta mensagem — os dois lados de um
 * mesmo duelo podem receber a tela em idiomas diferentes.
 */
function buildDeckChoiceMessage(battleId, side, inventory, selectedIds, deck, wager = 0, t = criarT(DEFAULT_LOCALE)) {
    const selecionadas = new Set((selectedIds || []).map(String));
    const completo = deck.length === 3;

    const embed = ui.base(completo ? ui.STATUS_COLORS.success : ui.STATUS_COLORS.warning)
        .setTitle(t('battle.monte_time'))
        .setDescription(
            completo
                ? t('battle.time_completo')
                : [
                    t('battle.escolha_3'),
                    '',
                    `${'🔵'.repeat(deck.length)}${'⚪'.repeat(3 - deck.length)}  **${deck.length}/3**`,
                    '',
                    t('battle.ordem_importa')
                ].join('\n')
        );

    if (wager > 0) {
        embed.addFields({
            name: t('battle.em_jogo'),
            value: t('battle.em_jogo_texto', { valor: ui.coins(wager * 2, t.locale) }),
            inline: false
        });
    }

    if (deck.length > 0) {
        embed.addFields({
            name: t('battle.seu_time'),
            value: deck.map((c, i) => {
                const meta = ui.getRarity(c.rarity, t.locale);
                return `\`${i + 1}\` ${meta.emoji} **${ui.cardName(c.name, t.locale)}** — ${t('atributos.ovr')} ${getOvr(c)}\n`
                    + `└ ⚔️ ${c.ATA ?? 0} · ❤️ ${c.LIF ?? 0} · 💥 ${c.POW ?? 0}`;
            }).join('\n')
        });
    }

    const cardsToShow = ordenarParaBatalha(inventory).slice(0, MAX_CARDS_SHOWN);

    if (inventory.length > MAX_CARDS_SHOWN) {
        embed.setFooter({
            text: `${ui.BRAND} • ${t('battle.mostrando_melhores', { mostradas: MAX_CARDS_SHOWN, total: inventory.length })}`
        });
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
            const meta = ui.getRarity(card.rarity, t.locale);
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

    return { embed, components: rows };
}

async function battleCollect(interaction, userX, userY, userXData, userYData, challengeMessage, wager = 0, t = criarT(DEFAULT_LOCALE)) {
    const filter = (i) => ['accept_battle', 'decline_battle'].includes(i.customId) && i.user.id === userY.id;
    const collector = challengeMessage.createMessageComponentCollector({ filter, time: 60000, max: 1 });

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

        // Cada DM sai no idioma do próprio destinatário — é mensagem
        // privada, então não há motivo para os dois verem o mesmo idioma.
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
