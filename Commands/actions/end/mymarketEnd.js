function mymarketEnd(interaction, message, collector) {
    collector.on('end', () => {
        if (message.editable) {
            message.edit({ components: [] });
        }
    });
}

module.exports = { mymarketEnd };
