let currentCollector = null;

module.exports = async (client, interaction, rollCollect, rollEnd) => {
    User.findOne({ id: interaction.user.id }, async (err, user) => {
        if (err) {
            console.error('Erro ao buscar as informações do usuário:', err);
            return interaction.reply('Houve um erro ao buscar as informações do usuário.');
        }

        const now = Date.now();

        // if (user && user.lastRoll && now - user.lastRoll < 1 * 60 * 1000) {
        //     const timeElapsed = now - user.lastRoll;
        //     const timeRemaining = 1 * 60 * 1000 - timeElapsed;

        //     const seconds = Math.floor((timeRemaining % (60 * 1000)) / 1000);
        //     return interaction.reply(`Você só pode rolar uma vez a cada 1 minuto (TEMPO DE TESTES). Faltam ${seconds} segundos para você roletar novamente.`);
        // }

        if (user && user.lastRoll && now - user.lastRoll < 15 * 60 * 1000) {
            const timeElapsed = now - user.lastRoll;
            const timeRemaining = 15 * 60 * 1000 - timeElapsed;

            const minutes = Math.floor(timeRemaining / (60 * 1000));
            const seconds = Math.floor((timeRemaining % (60 * 1000)) / 1000);
            return interaction.reply(`Você só pode rolar uma vez a cada 15 minutos. Faltam ${minutes} minutos e ${seconds} segundos para você roletar novamente.`);
        }

        const rarities = [
            { rarity: 'Common', percentage: 70 },
            { rarity: 'Rare', percentage: 20 },
            { rarity: 'Ultra Rare', percentage: 8 },
            { rarity: 'Legendary', percentage: 1.5 },
            { rarity: 'Master', percentage: 0.5 }
        ];

        const random = Math.random() * 100;
        let accumulated = 0;
        let rarity;
        for (const r of rarities) {
            accumulated += r.percentage;
            if (random <= accumulated) {
                rarity = r.rarity;
                break;
            }
        }

        const cards = await Card.find({ rarity: rarity }).exec();
        if (!cards || cards.length === 0) {
            return interaction.reply('Nenhuma carta encontrada com a raridade especificada.');
        }

        const card = cards[Math.floor(Math.random() * cards.length)];
        const marketValue = (card.ata + card.int + card.def + card.des + card.pow + card.res) * 10;
        const valueToSell = marketValue / 2;

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`enviarInventario_${card._id}_${interaction.user.id}`)
                    .setLabel('Enviar ao Inventário')
                    .setStyle(ButtonStyle.Primary)
            )
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`vender_${card._id}_${interaction.user.id}`)
                    .setLabel(`Vender por ${valueToSell} moedas`)
                    .setStyle(ButtonStyle.Secondary)
            );

        const embed = new EmbedBuilder()
            .setTitle('Carta Sorteada')
            .addFields(
                { name: "Nome", value: card.name.charAt(0).toUpperCase() + card.name.slice(1) },
                { name: "Raridade", value: card.rarity },
                { name: "Valor de Mercado", value: marketValue.toString() }
            )
            .setImage(card.image);

        interaction.reply({ embeds: [embed], components: [row] });

        if (!user) {
            user = new User({ id: interaction.user.id });
        }

        user.lastRoll = now;
        await user.save();

        if (currentCollector) {
            currentCollector.stop();
        }

        currentCollector = rollCollect(interaction, card, user, marketValue, valueToSell, rollEnd);
    });
};
