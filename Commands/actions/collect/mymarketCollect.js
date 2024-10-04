const Market = require('../../utils/marketSchema.js');

async function mymarketCollect(interaction, collector) {
    collector.on('collect', async (i) => {
        if (i.customId === 'clear_history') {
            await Market.deleteMany({ sellerId: interaction.user.id, status: 'sold' });
            return i.update({ content: 'Histórico de vendas limpo com sucesso.', embeds: [], components: [] });
        }
    });
}

module.exports = { mymarketCollect };
