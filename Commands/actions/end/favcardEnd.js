module.exports = (message, reason) => {
    if (reason !== 'collected') {
        // Some com os botões quando o tempo acaba.
        message.edit({ components: [] }).catch(() => {});
    }
};
