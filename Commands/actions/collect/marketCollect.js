const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, MessageFlags } = require('discord.js');
const ui = require('../../utils/embeds');
const valores = require('../../utils/valores');

/**
 * Paginação + compra do /market.
 *
 * Antes a compra era feita digitando o número da carta no chat, o que
 * obrigava o bot a usar o intent privilegiado MessageContent. Agora é um
 * menu de seleção, então o intent deixou de ser necessário.
 */
// NÃO marcar como async: quem chama usa o retorno como coletor
// (`collector.on(...)`). Se a função for async ela devolve uma Promise
// e a chamada quebra com "collector.on is not a function".
module.exports = (interaction, embedMessage, currentPage, listings, cardsPerPage, marketEnd, generateEmbed, generateButtons) => {
    const totalPages = Math.ceil(listings.length / cardsPerPage);

    const filtro = (i) =>
        i.user.id === interaction.user.id &&
        ['previous_page', 'next_page', 'market_select'].includes(i.customId);

    const collector = embedMessage.createMessageComponentCollector({ filter: filtro, time: 180000 });

    collector.on('collect', async (i) => {
        if (i.customId === 'previous_page' || i.customId === 'next_page') {
            if (i.customId === 'previous_page') currentPage = Math.max(0, currentPage - 1);
            else currentPage = Math.min(totalPages - 1, currentPage + 1);

            return i.update({
                embeds: [generateEmbed(currentPage)],
                components: generateButtons(currentPage)
            });
        }

        // Seleção de uma carta para comprar
        const escolhidoId = i.values?.[0];
        const selectedCard = listings.find((l) => String(l._id) === escolhidoId);
        if (!selectedCard) {
            return i.reply({ embeds: [ui.error('Carta indisponível', 'Esse anúncio não existe mais.')], flags: MessageFlags.Ephemeral });
        }

        if (selectedCard.sellerId === interaction.user.id) {
            return i.reply({ embeds: [ui.error('Anúncio seu', 'Você não pode comprar a própria carta. Use `/undosell` para retirá-la.')], flags: MessageFlags.Ephemeral });
        }

        const meta = ui.getRarity(selectedCard.rarity);
        const ovr = valores.overallDaCarta(selectedCard);

        const confirmEmbed = ui.base(meta.color)
            .setTitle('🛒 Confirmar compra')
            .setDescription([
                `${meta.emoji} **${ui.cardName(selectedCard)}** — OVR **${ovr}**`,
                `*${selectedCard.series || '—'}*`,
                '',
                ui.statLines(selectedCard),
                '',
                `Preço: ${ui.coins(selectedCard.listingPrice)}`,
                `Vendedor: <@${selectedCard.sellerId}>`
            ].join('\n'));

        if (selectedCard.characterImage) confirmEmbed.setThumbnail(selectedCard.characterImage);

        const confirmButtons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('confirm_buy').setLabel('Comprar').setEmoji('🪙').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('cancel_buy').setLabel('Cancelar').setStyle(ButtonStyle.Secondary)
        );

        await i.reply({
            embeds: [confirmEmbed],
            components: [confirmButtons]
        });
        const confirmMessage = await i.fetchReply();

        marketEnd(confirmMessage, selectedCard, interaction);
    });

    collector.on('end', () => {
        marketEnd(embedMessage);
    });

    return collector;
};

/** Monta o menu de seleção com as cartas da página atual. */
function buildSelectMenu(listings, page, cardsPerPage) {
    const inicio = page * cardsPerPage;
    const pageCards = listings.slice(inicio, inicio + cardsPerPage);

    const options = pageCards.map((listing) => {
        const meta = ui.getRarity(listing.rarity);
        const ovr = valores.overallDaCarta(listing);
        return {
            label: `${ui.cardName(listing)} · OVR ${ovr}`.slice(0, 100),
            description: `${meta.label} • ${ui.number(listing.listingPrice)} moedas • ${listing.series || '—'}`.slice(0, 100),
            value: String(listing._id),
            emoji: meta.emoji
        };
    });

    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('market_select')
            .setPlaceholder('Escolha uma carta para comprar')
            .addOptions(options)
    );
}

module.exports.buildSelectMenu = buildSelectMenu;
