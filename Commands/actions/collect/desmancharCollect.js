const User = require('../../utils/userSchema');
const ui = require('../../utils/embeds');
const bolsa = require('../../utils/bolsa');
const itens = require('../../utils/itens');
const { updateEmbed, buildConfirmationRow, gemasDe, contarCopias, contarGemas } = require('../run/desmancharRun');
const transacoes = require('../../utils/transacoes');
const { criarT, DEFAULT_LOCALE } = require('../../utils/i18n');

async function desmancharCollect(i, indexRef, matchingCards, user, rowNavigation, t = criarT(DEFAULT_LOCALE)) {
    if (i.customId === 'prev' || i.customId === 'next') {
        indexRef.currentIndex = i.customId === 'next'
            ? (indexRef.currentIndex + 1) % matchingCards.length
            : (indexRef.currentIndex - 1 + matchingCards.length) % matchingCards.length;

        const card = matchingCards[indexRef.currentIndex];
        await i.update({
            embeds: [updateEmbed(card, contarCopias(user, card), t)],
            components: [rowNavigation, buildConfirmationRow(card, t)]
        });
        return;
    }

    if (i.customId === 'confirm_desmanchar') {
        const card = matchingCards[indexRef.currentIndex];
        const gemas = gemasDe(card);

        // Remoção atômica pelo _id da subdocument, igual ao /quicksell: se
        // a carta já saiu do inventário por outro clique ou outro canal,
        // `updatedUser` vem null e não pagamos gema duas vezes pela mesma
        // carta.
        const updatedUser = await User.findOneAndUpdate(
            { id: user.id, 'inventory._id': card._id },
            { $pull: { inventory: { _id: card._id } } }
        );
        if (!updatedUser) {
            const embed = ui.error(t('market.indisponivel'), t('sell.sumiu_do_inventario'));
            await i.update({ embeds: [embed], components: [] });
            return 'collected';
        }

        // A carta já foi destruída. Se a entrega da gema falhar aqui, o
        // jogador perde a carta e não recebe nada — por isso a falha é
        // relatada com o número exato, para dar conserto manual.
        let total;
        try {
            total = await bolsa.adicionar(user.id, 'gema', gemas);
        } catch (err) {
            const embed = ui.error(
                t('desmanchar.gema_nao_entrou'),
                t('desmanchar.gema_nao_entrou_texto', {
                    carta: ui.cardName(card),
                    gemas: contarGemas(gemas, t)
                })
            );
            await i.update({ embeds: [embed], components: [] });
            throw err;
        }

        // A carta virou item, e nenhuma moeda foi criada — por isso
        // `moedaDelta` fica em zero. Cada desmanche é uma venda rápida que
        // deixou de imprimir dinheiro, e é isso que o razão registra.
        transacoes.registrar({
            userId: user.id,
            tipo: 'desmanche',
            itens: [{ chave: 'gema', quantidade: gemas }],
            contexto: {
                carta: card.name,
                raridade: card.rarity,
                overall: card.overall ?? null,
                nivel: card.nivel ?? 0
            }
        });

        const item = itens.localizarPorChave('gema', t.locale);
        const embed = ui.success(t('desmanchar.concluido'), [
            t('desmanchar.concluido_texto', {
                carta: ui.cardName(card),
                emoji: item.emoji,
                gemas: contarGemas(gemas, t)
            }),
            '',
            t('desmanchar.pokedex_continua')
        ].join('\n'))
            .addFields({
                name: t('desmanchar.gemas_na_bolsa'),
                value: `${item.emoji} ${ui.number(total, t.locale)}`,
                inline: true
            });

        await i.update({ embeds: [embed], components: [] });
        return 'collected';
    }

    if (i.customId === 'cancel_desmanchar') {
        await i.update({
            embeds: [ui.neutral(t('desmanchar.cancelado'), t('sell.cancelado_texto'))],
            components: []
        });
        return 'collected';
    }
}

module.exports = desmancharCollect;
