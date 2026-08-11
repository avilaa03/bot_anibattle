const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const Market = require('../../utils/marketSchema.js');
const { mymarketCollect } = require('../collect/mymarketCollect.js');
const ui = require('../../utils/embeds.js');
const { tDaInteracao } = require('../../utils/idioma.js');

async function mymarketRun(client, interaction) {
    const t = await tDaInteracao(interaction);

    const listings = await Market.find({ sellerId: interaction.user.id }).lean();

    if (listings.length === 0) {
        const embed = ui.neutral(t('mymarket.vazio_titulo'), t('mymarket.vazio_texto'));
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    const disponiveis = listings.filter((l) => l.status === 'available');
    const vendidas = listings.filter((l) => l.status === 'sold');

    const formatar = (listing) => {
        const meta = ui.getRarity(listing.rarity, t.locale);
        // Antes esta linha mostrava listing.marketValue (o valor base da
        // carta), não o preço que o jogador realmente pediu no anúncio.
        const preco = listing.listingPrice ?? listing.marketValue ?? 0;
        return `${meta.emoji} **${ui.cardName(listing)}** — ${ui.coins(preco, t.locale)}`;
    };

    const totalAVenda = disponiveis.reduce((sum, l) => sum + (l.listingPrice ?? l.marketValue ?? 0), 0);
    const totalVendido = vendidas.reduce((sum, l) => sum + (l.listingPrice ?? l.marketValue ?? 0), 0);

    const embed = ui.base(ui.STATUS_COLORS.info)
        .setAuthor({
            name: t('mymarket.autor', { jogador: interaction.user.username }),
            iconURL: interaction.user.displayAvatarURL()
        })
        .setTitle(t('mymarket.titulo'));

    if (disponiveis.length > 0) {
        embed.addFields({
            name: t('mymarket.a_venda', { n: disponiveis.length }),
            value: disponiveis.slice(0, 15).map(formatar).join('\n')
                + (disponiveis.length > 15 ? `\n*${t('mymarket.e_mais', { n: disponiveis.length - 15 })}*` : ''),
            inline: false
        });
    }

    if (vendidas.length > 0) {
        embed.addFields({
            name: t('mymarket.vendidas', { n: vendidas.length }),
            value: vendidas.slice(0, 10).map(formatar).join('\n')
                + (vendidas.length > 10 ? `\n*${t('mymarket.e_mais', { n: vendidas.length - 10 })}*` : ''),
            inline: false
        });
    }

    embed.addFields(
        { name: t('mymarket.anunciado_agora'), value: ui.coins(totalAVenda, t.locale), inline: true },
        { name: t('mymarket.total_vendido'), value: ui.coins(totalVendido, t.locale), inline: true }
    );

    const components = [];
    if (vendidas.length > 0) {
        components.push(new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('clear_history')
                .setLabel(t('mymarket.botao_limpar'))
                .setEmoji('🧹')
                .setStyle(ButtonStyle.Danger)
        ));
    }

    await interaction.reply({ embeds: [embed], components });
    const message = await interaction.fetchReply();

    if (components.length === 0) return;

    const filter = (i) => i.customId === 'clear_history' && i.user.id === interaction.user.id;
    const collector = message.createMessageComponentCollector({ filter, time: 60000, max: 1 });

    // Antes o coletor era criado mas nunca ligado ao handler, então o botão
    // de limpar histórico simplesmente não fazia nada.
    mymarketCollect(interaction, collector, t);

    collector.on('end', (collected, reason) => {
        if (reason === 'time') {
            message.edit({ components: [] }).catch(() => {});
        }
    });
}

module.exports = mymarketRun;
