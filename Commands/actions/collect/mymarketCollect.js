const Market = require('../../utils/marketSchema.js');
const ui = require('../../utils/embeds.js');

async function mymarketCollect(interaction, collector) {
    collector.on('collect', async (i) => {
        if (i.customId === 'clear_history') {
            const resultado = await Market.deleteMany({ sellerId: interaction.user.id, status: 'sold' });
            const embed = ui.success('Histórico limpo', `${resultado.deletedCount || 0} venda(s) removida(s) do seu histórico.`);
            return i.update({ embeds: [embed], components: [] });
        }
    });
}

module.exports = { mymarketCollect };
