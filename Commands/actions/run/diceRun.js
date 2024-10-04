function Dice() {
    return 1 + Math.floor(Math.random() * 6);
}

async function diceRun(client, interaction) {
    const dice = Dice();
    return interaction.reply({ content: String(dice) })
}

module.exports = diceRun