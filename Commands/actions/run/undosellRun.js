const User = require('../../utils/userSchema.js');
const Market = require('../../utils/marketSchema.js');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const ui = require('../../utils/embeds.js');
const valores = require('../../utils/cardValues.js');
const { renderCard } = require('../../utils/cardRenderer.js');
const { escapeRegex } = require('../../utils/regexUtils.js');
const { molduraEfetiva } = require('../../utils/vip.js');
const { tDaInteracao } = require('../../utils/language.js');

async function undosellRun(client, interaction) {
    const t = await tDaInteracao(interaction);

    const cardName = (interaction.options.getString('cardname') || '').trim();
    if (!cardName) {
        const embed = ui.error(t('undosell.nome_invalido'), t('undosell.nome_invalido_texto'));
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    const listings = await Market.find({
        sellerId: interaction.user.id,
        status: 'available',
        cardName: { $regex: new RegExp(escapeRegex(cardName), 'i') }
    }).lean();

    if (!listings || listings.length === 0) {
        const embed = ui.error(t('undosell.nao_encontrado'), t('undosell.nao_encontrado_texto'));
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

        const embed = ui.base(ui.getRarity(listing.rarity, t.locale).color)
            .setTitle(t('undosell.titulo'))
            .setDescription(t('undosell.confirme'))
            .addFields(
                { name: t('comum.carta'), value: listing.cardName || t('comum.traco'), inline: true },
                { name: t('undosell.preco_anuncio'), value: ui.coins(price, t.locale), inline: true },
                { name: t('undosell.raridade'), value: ui.rarityTag(listing.rarity, t.locale), inline: true }
            )
            .setImage(render.url)
            .setFooter({ text: listings.length > 1 ? `${ui.BRAND} • ${t('undosell.contador', { atual: indexRef.currentIndex + 1, total: listings.length })}` : ui.BRAND });
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
                new ButtonBuilder().setCustomId('undosell_confirm').setLabel(t('undosell.botao_confirmar')).setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('undosell_cancel').setLabel(t('comum.cancelar')).setStyle(ButtonStyle.Danger)
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
            await i.update({ embeds: [ui.neutral(t('undosell.cancelado'), t('undosell.cancelado_texto'))], components: [], files: [] });
            collector.stop();
            return;
        }
        if (i.customId === 'undosell_confirm') {
            const listing = listings[indexRef.currentIndex];
            await Market.deleteOne({ _id: listing._id });

            const user = await User.findOne({ id: interaction.user.id });
            if (!user) {
                await i.update({ embeds: [ui.error(t('comum.perfil_nao_encontrado'), t('undosell.perfil_sumiu'))], components: [], files: [] });
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
                comercializavel: listing.comercializavel !== false,
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

            const embed = ui.success(t('undosell.removido'), t('undosell.removido_texto', { carta: ui.cardName(listing) }));
            await i.update({ embeds: [embed], components: [], files: [] });
            collector.stop();
        }
    });
}

module.exports = undosellRun;
