async function pingRun(client, interaction) {
    return interaction.reply({ content: 'Pong!'});
}

module.exports = pingRun