const User = require("../../utils/userSchema")

async function dailyRun(client, interaction) {
    const userId = interaction.user.id;

    try {

      let user = await User.findOne({ id: userId });

      if (!user) {

        user = new User({
          id: userId,
          balance: 0,
          lastDaily: null
        });
      }

      const today = new Date();
      if (user.lastDaily && user.lastDaily.toDateString() === today.toDateString()) {
        return interaction.reply({
          content: "Você já coletou sua recompensa diária hoje. Tente novamente amanhã."
        });
      }

      const dailyAmount = Math.floor(Math.random() * (100 - 10 + 1) + 10);

      user.balance += dailyAmount;
      user.lastDaily = today;

      await user.save();

      return interaction.reply({
        content: `Você coletou sua recompensa diária de ${dailyAmount} dinheiros.`
      });
    } catch (err) {
      console.error('Erro ao processar a recompensa diária:', err);
      return interaction.reply('Houve um erro ao processar sua recompensa diária.');
    }
}

module.exports = dailyRun