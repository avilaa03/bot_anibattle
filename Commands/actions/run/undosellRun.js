const User = require('../../utils/userSchema.js');
const Market = require('../../utils/marketSchema.js');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const CardBuilder = require('../../utils/cardBuilder.js');

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function undosellRun(client, interaction) {
    const cardName = (interaction.options.getString('cardname') || '').trim();
    if (!cardName) {
        const embed = new EmbedBuilder()
            .setTitle('❌ Nome inválido')
            .setDescription('Informe o nome da carta.')
            .setColor('#E53935');
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const listings = await Market.find({
        sellerId: interaction.user.id,
        status: 'available',
        cardName: { $regex: new RegExp(escapeRegex(cardName), 'i') }
    }).lean();

    if (!listings || listings.length === 0) {
        const embed = new EmbedBuilder()
            .setTitle('❌ Anúncio não encontrado')
            .setDescription('Nenhum anúncio encontrado com esse nome (ou já foi vendido).')
            .setColor('#E53935');
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    await interaction.deferReply();

    const indexRef = { currentIndex: 0 };

    async function buildEmbed(listing) {
        const price = listing.listingPrice ?? listing.marketValue ?? 0;
        const cardData = {
            name: listing.cardName,
            series: listing.series,
            seriesImage: listing.seriesImage,
            baseImage: listing.baseImage,
            characterImage: listing.characterImage,
            rarity: listing.rarity,
            overall: listing.overall ?? listing.ovr ?? (listing.marketValue != null ? Math.round(listing.marketValue / 10) : 0),
            ATA: listing.ATA ?? listing.ata ?? 0,
            LIF: listing.LIF ?? listing.lif ?? 0,
            POW: listing.POW ?? listing.pow ?? 0
        };
        const cardBuilder = new CardBuilder(cardData);
        const cardImageBuffer = await cardBuilder.build();
        const attachment = new AttachmentBuilder(cardImageBuffer, { name: 'cardImage.png' });

        const embed = new EmbedBuilder()
            .setTitle('📋 Retirar carta do mercado')
            .setDescription('Confirme que é esta carta que deseja retirar do mercado. Ela voltará ao seu inventário.')
            .setColor('#FF9800')
            .addFields(
                { name: 'Carta', value: listing.cardName || '—', inline: true },
                { name: 'Preço no anúncio', value: `${price} moedas`, inline: true },
                { name: 'Raridade', value: listing.rarity || '—', inline: true }
            )
            .setImage('attachment://cardImage.png')
            .setFooter({ text: listings.length > 1 ? `Mostrando ${indexRef.currentIndex + 1} de ${listings.length} • Use os botões para trocar` : 'AniBattle' });
        return { embed, attachment };
    }

    function buildRows() {
        const rows = [];
        if (listings.length > 1) {
            rows.push(
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('undosell_prev').setLabel('Anterior').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('undosell_next').setLabel('Próximo').setStyle(ButtonStyle.Secondary)
                )
            );
        }
        rows.push(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('undosell_confirm').setLabel('Confirmar retirada').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('undosell_cancel').setLabel('Cancelar').setStyle(ButtonStyle.Danger)
            )
        );
        return rows;
    }

    const first = await buildEmbed(listings[0]);
    const reply = await interaction.editReply({
        embeds: [first.embed],
        components: buildRows(),
        files: [first.attachment]
    });

    const filter = i => i.user.id === interaction.user.id && ['undosell_prev', 'undosell_next', 'undosell_confirm', 'undosell_cancel'].includes(i.customId);
    const collector = reply.createMessageComponentCollector({ filter, time: 60000 });

    collector.on('collect', async (i) => {
        if (i.customId === 'undosell_prev') {
            indexRef.currentIndex = (indexRef.currentIndex - 1 + listings.length) % listings.length;
            await i.deferUpdate();
            const { embed, attachment } = await buildEmbed(listings[indexRef.currentIndex]);
            await i.editReply({ embeds: [embed], components: buildRows(), files: [attachment] });
            return;
        }
        if (i.customId === 'undosell_next') {
            indexRef.currentIndex = (indexRef.currentIndex + 1) % listings.length;
            await i.deferUpdate();
            const { embed, attachment } = await buildEmbed(listings[indexRef.currentIndex]);
            await i.editReply({ embeds: [embed], components: buildRows(), files: [attachment] });
            return;
        }
        if (i.customId === 'undosell_cancel') {
            await i.update({
                embeds: [new EmbedBuilder().setTitle('Cancelado').setDescription('Nenhuma alteração feita.').setColor('#9E9E9E')],
                components: []
            });
            collector.stop();
            return;
        }
        if (i.customId === 'undosell_confirm') {
            const listing = listings[indexRef.currentIndex];
            await Market.deleteOne({ _id: listing._id });

            const user = await User.findOne({ id: interaction.user.id });
            if (!user) {
                await i.update({ content: 'Erro: usuário não encontrado.', embeds: [], components: [] });
                return;
            }
            const card = {
                cardId: listing.cardId,
                originalCardId: listing.cardId,
                name: listing.cardName,
                series: listing.series,
                seriesImage: listing.seriesImage,
                baseImage: listing.baseImage,
                characterImage: listing.characterImage,
                rarity: listing.rarity,
                overall: listing.overall ?? listing.ovr ?? (listing.marketValue != null ? Math.round(listing.marketValue / 10) : 0),
                ATA: listing.ATA ?? listing.ata ?? 0,
                LIF: listing.LIF ?? listing.lif ?? 0,
                POW: listing.POW ?? listing.pow ?? 0,
                obtainedAt: listing.obtainedAt,
                marketValue: listing.marketValue,
                valueToSell: listing.marketValue ? Math.floor(listing.marketValue / 2) : 0
            };
            user.inventory.push(card);
            await user.save();

            const embed = new EmbedBuilder()
                .setTitle('✅ Anúncio removido')
                .setDescription(`**${listing.cardName}** foi retirada do mercado e devolvida ao seu inventário.`)
                .setColor('#4CAF50');
            await i.update({ embeds: [embed], components: [] });
            collector.stop();
        }
    });
}

module.exports = undosellRun;
