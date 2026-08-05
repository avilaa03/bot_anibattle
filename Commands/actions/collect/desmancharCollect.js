const User = require('../../utils/userSchema');
const ui = require('../../utils/embeds');
const bolsa = require('../../utils/bolsa');
const itens = require('../../utils/itens');
const { updateEmbed, buildConfirmationRow, gemasDe, contarCopias } = require('../run/desmancharRun');

async function desmancharCollect(i, indexRef, matchingCards, user, rowNavigation) {
    if (i.customId === 'prev' || i.customId === 'next') {
        indexRef.currentIndex = i.customId === 'next'
            ? (indexRef.currentIndex + 1) % matchingCards.length
            : (indexRef.currentIndex - 1 + matchingCards.length) % matchingCards.length;

        const card = matchingCards[indexRef.currentIndex];
        await i.update({
            embeds: [updateEmbed(card, contarCopias(user, card))],
            components: [rowNavigation, buildConfirmationRow(card)]
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
            const embed = ui.error('Carta indisponível', 'Essa carta não está mais no seu inventário.');
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
                'A carta foi desmanchada, mas a gema não entrou',
                `**${ui.cardName(card)}** valia **${ui.number(gemas)}** gema(s). Fale com a staff informando este erro.`
            );
            await i.update({ embeds: [embed], components: [] });
            throw err;
        }

        const item = itens.getItem('gema');
        const embed = ui.success('Carta desmanchada', [
            `**${ui.cardName(card)}** virou ${item.emoji} **${ui.number(gemas)} ${gemas === 1 ? 'gema' : 'gemas'}**.`,
            '',
            'A descoberta continua registrada na sua Pokédex.'
        ].join('\n'))
            .addFields({ name: 'Gemas na bolsa', value: `${item.emoji} ${ui.number(total)}`, inline: true });

        await i.update({ embeds: [embed], components: [] });
        return 'collected';
    }

    if (i.customId === 'cancel_desmanchar') {
        await i.update({
            embeds: [ui.neutral('Desmanche cancelado', 'Sua carta continua no inventário.')],
            components: []
        });
        return 'collected';
    }
}

module.exports = desmancharCollect;
