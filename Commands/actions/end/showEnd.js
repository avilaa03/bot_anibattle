function showEnd(message) {
    // Some os botões quando o tempo acaba, em vez de deixar botões
    // desabilitados poluindo a mensagem.
    message.edit({ components: [] }).catch(() => {});
}

module.exports = { showEnd };
