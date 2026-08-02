const User = require('../../utils/userSchema');
const ui = require('../../utils/embeds');
const { getProgress } = require('../../utils/discovery');

function getCardOvr(card) {
    return card.overall ?? (card.marketValue != null ? Math.round(card.marketValue / 10) : 0);
}

async function profileRun(client, interaction) {
    const alvo = interaction.options.getUser('user') || interaction.user;
    const user = await User.findOne({ id: alvo.id });

    if (!user) {
        const embed = ui.error('Perfil não encontrado', `${alvo.id === interaction.user.id ? 'Você ainda não tem' : `**${alvo.username}** ainda não tem`} um perfil. Ele é criado ao usar \`/roll\` ou \`/daily\`.`);
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const inventory = user.inventory || [];
    const totalCards = inventory.length;
    const totalValue = inventory.reduce((sum, card) => sum + (card.marketValue || 0), 0);

    const favCard = user.favCard
        ? inventory.find((card) => card.cardId && card.cardId.equals(user.favCard))
        : null;

    const highestOvrCard = totalCards > 0
        ? inventory.reduce((max, card) => (getCardOvr(card) > getCardOvr(max) ? card : max), inventory[0])
        : null;

    const wins = user.wins || 0;
    const losses = user.losses || 0;
    const totalBattles = wins + losses;
    const winRate = totalBattles > 0 ? Math.round((wins / totalBattles) * 100) : 0;

    // Contagem por raridade
    const byRarity = inventory.reduce((acc, c) => {
        const key = String(c.rarity || 'common').toLowerCase();
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {});
    const colecao = Object.keys(ui.RARITIES)
        .map((key) => `${ui.RARITIES[key].emoji} ${ui.RARITIES[key].label}: **${byRarity[key] || 0}**`)
        .join('\n');

    const pokedex = await getProgress(alvo.id);

    // A cor do perfil acompanha a raridade da carta favorita — dá uma
    // sensação de identidade para quem tem cartas boas.
    const cor = favCard ? ui.rarityColor(favCard.rarity) : ui.STATUS_COLORS.info;

    const embed = ui.base(cor)
        .setAuthor({ name: `Perfil de ${alvo.username}`, iconURL: alvo.displayAvatarURL() })
        .addFields(
            { name: '🪙 Saldo', value: ui.coins(user.balance || 0), inline: true },
            { name: '🎴 Cartas', value: `**${ui.number(totalCards)}**`, inline: true },
            { name: '💎 Patrimônio', value: ui.coins(totalValue + (user.balance || 0)), inline: true },
            { name: '⚔️ Batalhas', value: totalBattles > 0 ? `**${wins}**V — **${losses}**D  (${winRate}% de vitórias)\n${ui.progressBar(winRate, 100)}` : 'Nenhuma batalha ainda', inline: false },
            {
                name: '📖 Pokédex',
                value: `**${ui.number(pokedex.descobertas)}** / ${ui.number(pokedex.total)} cartas descobertas (${pokedex.percentual.toFixed(1)}%)\n${ui.progressBar(pokedex.percentual, 100, 12)}`,
                inline: false
            },
            { name: '📚 Coleção', value: colecao, inline: true },
            {
                name: '🏆 Melhor carta',
                value: highestOvrCard
                    ? `${ui.getRarity(highestOvrCard.rarity).emoji} **${ui.cardName(highestOvrCard.name)}**\nOVR **${getCardOvr(highestOvrCard)}**`
                    : '—',
                inline: true
            }
        );

    if (favCard) {
        embed.setDescription(`⭐ Carta favorita: ${ui.getRarity(favCard.rarity).emoji} **${ui.cardName(favCard.name)}** — *${favCard.series || '—'}*`);
        if (favCard.characterImage || favCard.baseImage) {
            embed.setThumbnail(favCard.characterImage || favCard.baseImage);
        }
    } else {
        embed.setDescription('⭐ Nenhuma carta favorita definida. Use `/favcard` para escolher uma.');
    }

    return interaction.reply({ embeds: [embed] });
}

module.exports = profileRun;
