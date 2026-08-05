const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const ui = require('../../utils/embeds');
const aprimoramento = require('../../utils/aprimoramento');
const itens = require('../../utils/itens');
const bolsa = require('../../utils/bolsa');

/**
 * /aprimorar — gasta gema para tentar subir o nível da carta.
 *
 * A tela mostra as três chances ANTES de qualquer clique, com o número.
 * Esconder a probabilidade seria o desenho de caça-níquel: aqui o jogador
 * decide sabendo que em nível alto ele está apostando contra si mesmo.
 */

const pct = (n) => `${(n * 100).toFixed(1)}%`;

function linhaDeStats(atual, proximo) {
    const seta = (de, para) => (de === para ? `${de}` : `${de} → **${para}**`);
    return [
        `⚔️ ATA ${seta(atual.ATA, proximo.ATA)}`,
        `❤️ LIF ${seta(atual.LIF, proximo.LIF)}`,
        `💥 POW ${seta(atual.POW, proximo.POW)}`
    ].join(' • ');
}

function montarEmbed(card, user) {
    const nivel = Math.max(0, Number(card.nivel) || 0);
    const base = aprimoramento.baseDaCarta(card);
    const meta = ui.getRarity(card.rarity);

    const c = aprimoramento.chances(card.rarity, nivel);
    const custo = aprimoramento.custoEmGemas(card.rarity, nivel);
    const gemas = bolsa.quantidadeDe(user, 'gema');
    const pergaminhos = bolsa.quantidadeDe(user, 'pergaminho');

    const atual = aprimoramento.statsDoNivel(base, nivel);
    const proximo = aprimoramento.statsDoNivel(base, nivel + 1);

    const titulo = ui.cardName(card);

    const linhas = [
        `${meta.emoji} ${ui.rarityTag(card.rarity)} • *${card.series || '—'}*`,
        '',
        `Overall **${atual.overall}** → **${proximo.overall}** *(natural ${base.overall})*`,
        linhaDeStats(atual, proximo),
        '',
        '**Chances desta tentativa**',
        `✅ Sobe um nível — **${pct(c.sucesso)}**`,
        `➖ Não acontece nada — **${pct(c.nada)}**`,
        c.queda > 0
            ? `🔻 Cai um nível — **${pct(c.queda)}**`
            : '🔻 Cai um nível — **0%** *(o overall natural é o chão: carta em nível 0 não tem o que perder)*',
        '',
        `Custa 💎 **${ui.number(custo)}** ${custo === 1 ? 'gema' : 'gemas'} — você tem **${ui.number(gemas)}**.`
    ];

    if (c.queda > 0) {
        linhas.push(
            pergaminhos > 0
                ? `📜 Você tem **${ui.number(pergaminhos)}** pergaminho(s): protegem contra a queda, e só somem se a queda acontecer.`
                : '📜 Sem pergaminho de proteção na bolsa — veja a `/loja`.'
        );
    }

    linhas.push('', '*A gema é gasta em qualquer desfecho. Não há teto de nível.*');

    const embed = ui.base(meta.color)
        .setTitle(`✨ Aprimorar ${titulo}?`)
        .setDescription(linhas.join('\n'));

    if (card.characterImage) embed.setThumbnail(card.characterImage);
    else if (card.baseImage) embed.setThumbnail(card.baseImage);
    return embed;
}

function montarBotoes(card, user) {
    const nivel = Math.max(0, Number(card.nivel) || 0);
    const custo = aprimoramento.custoEmGemas(card.rarity, nivel);
    const temGema = bolsa.quantidadeDe(user, 'gema') >= custo;
    const temPergaminho = bolsa.quantidadeDe(user, 'pergaminho') >= 1;
    const podeCair = aprimoramento.chances(card.rarity, nivel).queda > 0;

    const botoes = [
        new ButtonBuilder()
            .setCustomId('confirm_aprimorar')
            .setLabel(`Aprimorar (${custo} 💎)`)
            .setEmoji('✨')
            .setStyle(ButtonStyle.Success)
            .setDisabled(!temGema)
    ];

    // O botão protegido só aparece quando há queda para segurar. Em nível
    // 0 ele gastaria um pergaminho de 25.000 moedas contra um risco de 0%.
    if (podeCair) {
        botoes.push(
            new ButtonBuilder()
                .setCustomId('confirm_aprimorar_protegido')
                .setLabel('Aprimorar com proteção (📜)')
                .setEmoji('🛡️')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(!temGema || !temPergaminho)
        );
    }

    botoes.push(
        new ButtonBuilder()
            .setCustomId('cancel_aprimorar')
            .setLabel('Cancelar')
            .setStyle(ButtonStyle.Secondary)
    );

    return new ActionRowBuilder().addComponents(...botoes);
}

async function aprimorarRun(client, interaction, user, matchingCards) {
    await interaction.deferReply();

    const indexRef = { currentIndex: 0 };

    const rowNavigation = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('prev').setEmoji('◀️').setStyle(ButtonStyle.Secondary).setDisabled(matchingCards.length === 1),
        new ButtonBuilder().setCustomId('next').setEmoji('▶️').setStyle(ButtonStyle.Secondary).setDisabled(matchingCards.length === 1)
    );

    const message = await interaction.editReply({
        embeds: [montarEmbed(matchingCards[0], user)],
        components: [rowNavigation, montarBotoes(matchingCards[0], user)]
    });

    return { message, indexRef, rowNavigation };
}

module.exports = { aprimorarRun, montarEmbed, montarBotoes, linhaDeStats, pct };
