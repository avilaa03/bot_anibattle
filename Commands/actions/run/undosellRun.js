const User = require('../../utils/userSchema.js');
const Market = require('../../utils/marketSchema.js');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const ui = require('../../utils/embeds.js');
const valores = require('../../utils/valores.js');
const { renderCard } = require('../../utils/cardRenderer.js');
const { escapeRegex } = require('../../utils/regexUtils.js');
const { molduraEfetiva } = require('../../utils/vip.js');

async function undosellRun(client, interaction) {
    const cardName = (interaction.options.getString('cardname') || '').trim();
    if (!cardName) {
        const embed = ui.error('Nome inválido', 'Informe o nome da carta que você quer retirar do mercado.');
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    const listings = await Market.find({
        sellerId: interaction.user.id,
        status: 'available',
        cardName: { $regex: new RegExp(escapeRegex(cardName), 'i') }
    }).lean();

    if (!listings || listings.length === 0) {
        const embed = ui.error('Anúncio não encontrado', 'Nenhum anúncio seu com esse nome (ou a carta já foi vendida).');
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply();

    const indexRef = { currentIndex: 0 };
    const dono = await User.findOne({ id: interaction.user.id }).lean();
    const moldura = molduraEfetiva(dono);

    async function buildEmbed(listing) {
        const price = listing.listingPrice ?? listing.marketValue ?? 0;
        const cardData = {
            name: listing.cardName,
            series: listing.series,
            seriesImage: listing.seriesImage,
            baseImage: listing.baseImage,
            characterImage: listing.characterImage,
            rarity: listing.rarity,
            overall: valores.overallDaCarta(listing),
            ATA: listing.ATA ?? listing.ata ?? 0,
            LIF: listing.LIF ?? listing.lif ?? 0,
            POW: listing.POW ?? listing.pow ?? 0
        };
        const render = await renderCard(cardData, { moldura });
        const attachment = render.attachment;

        const embed = ui.base(ui.getRarity(listing.rarity).color)
            .setTitle('📋 Retirar do mercado')
            .setDescription('Confirme a retirada — a carta volta para o seu inventário.')
            .addFields(
                { name: 'Carta', value: listing.cardName || '—', inline: true },
                { name: 'Preço no anúncio', value: ui.coins(price), inline: true },
                { name: 'Raridade', value: ui.rarityTag(listing.rarity), inline: true }
            )
            .setImage(render.url)
            .setFooter({ text: listings.length > 1 ? `${ui.BRAND} • Anúncio ${indexRef.currentIndex + 1} de ${listings.length}` : ui.BRAND });
        return { embed, attachment };
    }

    function buildRows() {
        const rows = [];
        if (listings.length > 1) {
            rows.push(
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('undosell_prev').setEmoji('◀️').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('undosell_next').setEmoji('▶️').setStyle(ButtonStyle.Secondary)
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
            await i.update({ embeds: [ui.neutral('Cancelado', 'Nenhuma alteração feita.')], components: [], files: [] });
            collector.stop();
            return;
        }
        if (i.customId === 'undosell_confirm') {
            const listing = listings[indexRef.currentIndex];
            await Market.deleteOne({ _id: listing._id });

            const user = await User.findOne({ id: interaction.user.id });
            if (!user) {
                await i.update({ embeds: [ui.error('Perfil não encontrado', 'Não foi possível localizar seu perfil.')], components: [], files: [] });
                return;
            }
            // Os dois valores saem do MESMO cálculo — ver marketEnd.js.
            const preco = valores.valoresDaCarta(listing);

            const card = {
                cardId: listing.cardId,
                originalCardId: listing.cardId,
                name: listing.cardName,
                series: listing.series,
                seriesImage: listing.seriesImage,
                baseImage: listing.baseImage,
                characterImage: listing.characterImage,
                rarity: listing.rarity,
                overall: preco.overall,
                ATA: listing.ATA ?? listing.ata ?? 0,
                LIF: listing.LIF ?? listing.lif ?? 0,
                POW: listing.POW ?? listing.pow ?? 0,
                obtainedAt: listing.obtainedAt,
                // Cancelar o anúncio devolve a carta como ela era, com o
                // aprimoramento. Sem isto, tirar do mercado zeraria o
                // nível — a mesma perda que a compra tinha.
                nivel: listing.nivel ?? 0,
                base: listing.base,
                marketValue: preco.marketValue,
                valueToSell: preco.valueToSell
            };
            user.inventory.push(card);
            await user.save();

            const embed = ui.success('Anúncio removido', `**${ui.cardName(listing)}** voltou para o seu inventário.`);
            await i.update({ embeds: [embed], components: [], files: [] });
            collector.stop();
        }
    });
}

module.exports = undosellRun;
