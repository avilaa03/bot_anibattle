const User = require('../../utils/userSchema');
const ui = require('../../utils/embeds');
const { getProgress } = require('../../utils/discovery');
const vip = require('../../utils/vip');
const { getTier, corPerfilEfetiva, isVipAtivo, getPerks } = vip;
const { tDaInteracao } = require('../../utils/idioma');
const achievements = require('../../utils/achievements');
const elo = require('../../utils/elo');
const valores = require('../../utils/valores');
const nivel = require('../../utils/nivel');
const { MessageFlags } = require('discord.js');

const getCardOvr = valores.overallDaCarta;

async function profileRun(client, interaction) {
    const t = await tDaInteracao(interaction);

    const alvo = interaction.options.getUser('user') || interaction.user;
    const user = await User.findOne({ id: alvo.id });

    if (!user) {
        const embed = ui.error(
            t('comum.perfil_nao_encontrado'),
            alvo.id === interaction.user.id
                ? t('profile.voce_sem_perfil')
                : t('profile.outro_sem_perfil', { jogador: alvo.username })
        );
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
    // `ui.RARITIES` guarda só mecânica; o rótulo sai de `getRarity`, que
    // consulta o dicionário. Ler `.label` daqui devolveria `undefined`.
    const colecao = Object.keys(ui.RARITIES)
        .map((key) => {
            const meta = ui.getRarity(key, t.locale);
            return `${meta.emoji} ${meta.label}: **${byRarity[key] || 0}**`;
        })
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
    const nomeVip = tierVip ? vip.nomeTier(tierVip.key, t.locale) : null;

    const selos = [];
    if (user.staff) selos.push(t('profile.selo_staff'));
    if (user.beta?.participou) selos.push(t('profile.selo_beta'));
    if (tierVip) selos.push(`${tierVip.emoji} ${nomeVip}`);

    const embed = ui.base(cor)
        .setAuthor({
            name: `${emblema}${t('profile.autor', { jogador: alvo.username })}`,
            iconURL: alvo.displayAvatarURL()
        })
        .addFields(
            ...(selos.length > 0 ? [{ name: '​', value: selos.join('  •  '), inline: false }] : []),
            {
                name: t('profile.nivel'),
                value: (() => {
                    const p = nivel.progresso(user.xp);
                    const cargas = nivel.maxCargas(p.nivel) + (getPerks(user).cargasExtras || 0);
                    return `${t('profile.nivel_texto', {
                        nivel: p.nivel,
                        atual: ui.number(p.noNivel, t.locale),
                        proximo: ui.number(p.paraOProximo, t.locale)
                    })}\n`
                        + `${ui.progressBar(p.percentual, 100, 12)}\n`
                        + t('profile.acumula_rolls', { cargas });
                })(),
                inline: false
            },
            { name: t('profile.saldo'), value: ui.coins(user.balance || 0, t.locale), inline: true },
            { name: t('profile.cartas'), value: `**${ui.number(totalCards, t.locale)}**`, inline: true },
            {
                name: t('profile.patrimonio'),
                value: ui.coins(totalValue + (user.balance || 0), t.locale),
                inline: true
            },
            {
                name: t('profile.batalhas'),
                value: totalBattles > 0
                    ? `${t('profile.batalhas_texto', { vitorias: wins, derrotas: losses, pct: winRate })}\n${ui.progressBar(winRate, 100)}`
                    : t('profile.sem_batalhas'),
                inline: false
            },
            {
                name: t('profile.ranking'),
                value: (() => {
                    const pontos = user.elo ?? elo.ELO_INICIAL;
                    const div = elo.divisao(pontos, t.locale);
                    return totalBattles > 0
                        ? t('profile.ranking_texto', {
                            emoji: div.emoji,
                            divisao: div.nome,
                            pontos: ui.number(pontos, t.locale)
                        })
                        : t('profile.sem_partidas');
                })(),
                inline: true
            },
            {
                name: t('profile.sequencia'),
                value: user.streak?.atual > 0
                    ? t('profile.sequencia_texto', { atual: user.streak.atual, recorde: user.streak.maior })
                    : t('profile.sem_sequencia'),
                inline: true
            },
            {
                name: t('profile.trofeus'),
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
                        .map((tipo) => `${achievements.TIPOS[tipo].emoji}${obtidos[tipo]}`)
                        .join(' ');
                    return `${linha}\n${t('profile.trofeus_texto', {
                        obtidos: chaves.length,
                        total: totalTodos,
                        nivel: achievements.nivel(achievements.pontos(chaves))
                    })}`;
                })(),
                inline: true
            },
            {
                name: t('profile.pokedex'),
                value: `${t('profile.pokedex_texto', {
                    descobertas: ui.number(pokedex.descobertas, t.locale),
                    total: ui.number(pokedex.total, t.locale),
                    pct: pokedex.percentual.toFixed(1)
                })}\n${ui.progressBar(pokedex.percentual, 100, 12)}`,
                inline: false
            },
            { name: t('profile.colecao'), value: colecao, inline: true },
            {
                name: t('profile.melhor_carta'),
                value: highestOvrCard
                    ? `${ui.getRarity(highestOvrCard.rarity, t.locale).emoji} **${ui.cardName(highestOvrCard)}**\n`
                        + `${t('atributos.ovr')} **${getCardOvr(highestOvrCard)}**`
                    : t('comum.traco'),
                inline: true
            }
        );

    if (tierVip) {
        const expira = user.vip.expiresAt
            ? `<t:${Math.floor(new Date(user.vip.expiresAt).getTime() / 1000)}:R>`
            : t('profile.vitalicio');
        embed.addFields({
            name: t('profile.assinatura'),
            value: `${tierVip.emoji} ${t('profile.assinatura_texto', { plano: nomeVip, quando: expira })}`,
            inline: false
        });
    }

    if (favCard) {
        embed.setDescription(t('profile.favorita', {
            emoji: ui.getRarity(favCard.rarity, t.locale).emoji,
            carta: ui.cardName(favCard),
            serie: favCard.series || t('comum.traco')
        }));
        if (favCard.characterImage || favCard.baseImage) {
            embed.setThumbnail(favCard.characterImage || favCard.baseImage);
        }
    } else {
        embed.setDescription(t('profile.sem_favorita'));
    }

    return interaction.reply({ embeds: [embed] });
}

module.exports = profileRun;
