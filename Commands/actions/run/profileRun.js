const User = require('../../utils/userSchema');
const ui = require('../../utils/embeds');
const { getProgress } = require('../../utils/discovery');
const { getTier, corPerfilEfetiva, isVipAtivo } = require('../../utils/vip');
const achievements = require('../../utils/achievements');
const elo = require('../../utils/elo');
const valores = require('../../utils/valores');
const { MessageFlags } = require('discord.js');

const getCardOvr = valores.overallDaCarta;

async function profileRun(client, interaction) {
    const alvo = interaction.options.getUser('user') || interaction.user;
    const user = await User.findOne({ id: alvo.id });

    if (!user) {
        const embed = ui.error('Perfil não encontrado', `${alvo.id === interaction.user.id ? 'Você ainda não tem' : `**${alvo.username}** ainda não tem`} um perfil. Ele é criado ao usar \`/roll\` ou \`/daily\`.`);
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
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

    const tierVip = getTier(user);

    // Prioridade da cor: escolha do VIP > raridade da carta favorita > padrão.
    const cor = corPerfilEfetiva(user)
        ?? (favCard ? ui.rarityColor(favCard.rarity) : ui.STATUS_COLORS.info);

    const emblema = tierVip ? `${tierVip.emoji} ` : '';

    // Selos de identidade.
    //
    // Só aparecem para quem tem — perfil de jogador novo não fica com uma
    // fileira de espaços vazios. O de beta é permanente e não pode ser
    // conquistado depois: é isso que dá valor a ele.
    const selos = [];
    if (user.staff) selos.push('🛡️ Staff');
    if (user.beta?.participou) selos.push('🧪 Beta');
    if (tierVip) selos.push(`${tierVip.emoji} ${tierVip.nome}`);

    const embed = ui.base(cor)
        .setAuthor({ name: `${emblema}Perfil de ${alvo.username}`, iconURL: alvo.displayAvatarURL() })
        .addFields(
            ...(selos.length > 0 ? [{ name: '​', value: selos.join('  •  '), inline: false }] : []),
            { name: '🪙 Saldo', value: ui.coins(user.balance || 0), inline: true },
            { name: '🎴 Cartas', value: `**${ui.number(totalCards)}**`, inline: true },
            { name: '💎 Patrimônio', value: ui.coins(totalValue + (user.balance || 0)), inline: true },
            { name: '⚔️ Batalhas', value: totalBattles > 0 ? `**${wins}**V — **${losses}**D  (${winRate}% de vitórias)\n${ui.progressBar(winRate, 100)}` : 'Nenhuma batalha ainda', inline: false },
            {
                name: '⚔️ Ranking',
                value: (() => {
                    const pontos = user.elo ?? elo.ELO_INICIAL;
                    const div = elo.divisao(pontos);
                    return totalBattles > 0
                        ? `${div.emoji} **${div.nome}** — ${ui.number(pontos)} pts`
                        : 'Sem partidas ainda';
                })(),
                inline: true
            },
            {
                name: '🔥 Sequência',
                value: user.streak?.atual > 0
                    ? `**${user.streak.atual}** dia(s) (recorde: ${user.streak.maior})`
                    : 'Nenhuma — use \`/daily\`',
                inline: true
            },
            {
                name: '🏆 Troféus',
                value: (() => {
                    const chaves = (user.conquistas || []).map((c) => c.chave);
                    const totais = achievements.contagemPorTipo();
                    const obtidos = { bronze: 0, prata: 0, ouro: 0, platina: 0 };
                    for (const chave of chaves) {
                        const c = achievements.porChave(chave);
                        if (c) obtidos[c.tipo]++;
                    }
                    const totalTodos = Object.values(totais).reduce((a, b) => a + b, 0);
                    const linha = Object.keys(totais)
                        .map((t) => `${achievements.TIPOS[t].emoji}${obtidos[t]}`)
                        .join(' ');
                    return `${linha}\n**${chaves.length}**/${totalTodos} • Nível ${achievements.nivel(achievements.pontos(chaves))}`;
                })(),
                inline: true
            },
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

    if (tierVip) {
        const expira = user.vip.expiresAt
            ? `<t:${Math.floor(new Date(user.vip.expiresAt).getTime() / 1000)}:R>`
            : 'vitalício';
        embed.addFields({ name: '✨ Assinatura', value: `${tierVip.emoji} **${tierVip.nome}** — renova ${expira}`, inline: false });
    }

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
