const Market = require('../../utils/marketSchema.js');
const ui = require('../../utils/embeds.js');

async function mymarketCollect(interaction, collector, t) {
    collector.on('collect', async (i) => {
        if (i.customId === 'clear_history') {
            const resultado = await Market.deleteMany({ sellerId: interaction.user.id, status: 'sold' });
            const embed = ui.success(t('mymarket.historico_limpo'), t('mymarket.historico_limpo_texto', { n: resultado.deletedCount || 0 }));
            return i.update({ embeds: [embed], components: [] });
        }
    });
}

module.exports = { mymarketCollect };
