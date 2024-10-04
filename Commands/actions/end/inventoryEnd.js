module.exports = (embedMessage) => {
    if (embedMessage.editable) {
        embedMessage.edit({ components: [] });
    }
};
