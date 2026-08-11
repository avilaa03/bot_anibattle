const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const ui = require('../../utils/embeds');
const aprimoramento = require('../../utils/aprimoramento');
const itens = require('../../utils/itens');
const bolsa = require('../../utils/bolsa');
const { criarT, DEFAULT_LOCALE } = require('../../utils/i18n');

/**
 * /aprimorar — gasta gema para tentar subir o nível da carta.
 *
 * A tela mostra as três chances ANTES de qualquer clique, com o número.
 * Esconder a probabilidade seria o desenho de caça-níquel: aqui o jogador
 * decide sabendo que em nível alto ele está apostando contra si mesmo.
 */

const pct = (n) => `${(n * 100).toFixed(1)}%`;

function linhaDeStats(atual, proximo, t = criarT(DEFAULT_LOCALE)) {
    const seta = (de, para) => (de === para ? `${de}` : `${de} → **${para}**`);
    return [
        `⚔️ ${t('atributos.ata')} ${seta(atual.ATA, proximo.ATA)}`,
        `❤️ ${t('atributos.lif')} ${seta(atual.LIF, proximo.LIF)}`,
        `💥 ${t('atributos.pow')} ${seta(atual.POW, proximo.POW)}`
    ].join(' • ');
}

function montarEmbed(card, user, t = criarT(DEFAULT_LOCALE)) {
    const nivel = Math.max(0, Number(card.nivel) || 0);
    const base = aprimoramento.baseDaCarta(card);
    const meta = ui.getRarity(card.rarity, t.locale);

    const c = aprimoramento.chances(card.rarity, nivel);
    const custo = aprimoramento.custoEmGemas(card.rarity, nivel);
    const gemas = bolsa.quantidadeDe(user, 'gema');
    const pergaminhos = bolsa.quantidadeDe(user, 'pergaminho');

    const atual = aprimoramento.statsDoNivel(base, nivel);
    const proximo = aprimoramento.statsDoNivel(base, nivel + 1);

    const linhas = [
        `${meta.emoji} ${ui.rarityTag(card.rarity, t.locale)} • *${card.series || t('comum.traco')}*`,
        '',
        t('aprimorar.overall_linha', {
            atual: atual.overall,
            proximo: proximo.overall,
            natural: base.overall
        }),
        linhaDeStats(atual, proximo, t),
        '',
        t('aprimorar.chances_titulo'),
        t('aprimorar.chance_sucesso', { pct: pct(c.sucesso) }),
        t('aprimorar.chance_nada', { pct: pct(c.nada) }),
        c.queda > 0
            ? t('aprimorar.chance_queda', { pct: pct(c.queda) })
            : t('aprimorar.chance_queda_zero'),
        '',
        t('aprimorar.custo', {
            custo: ui.number(custo, t.locale),
            gemas: ui.number(gemas, t.locale)
        })
    ];

    if (c.queda > 0) {
        linhas.push(
            pergaminhos > 0
                ? t('aprimorar.tem_pergaminho', { quantidade: ui.number(pergaminhos, t.locale) })
                : t('aprimorar.sem_pergaminho')
        );
    }

    linhas.push('', `*${t('aprimorar.gema_sempre_gasta')}*`);

    const embed = ui.base(meta.color)
        .setTitle(t('aprimorar.titulo', { carta: ui.cardName(card) }))
        .setDescription(linhas.join('\n'));

    if (card.characterImage) embed.setThumbnail(card.characterImage);
    else if (card.baseImage) embed.setThumbnail(card.baseImage);
    return embed;
}

function montarBotoes(card, user, t = criarT(DEFAULT_LOCALE)) {
    const nivel = Math.max(0, Number(card.nivel) || 0);
    const custo = aprimoramento.custoEmGemas(card.rarity, nivel);
    const temGema = bolsa.quantidadeDe(user, 'gema') >= custo;
    const temPergaminho = bolsa.quantidadeDe(user, 'pergaminho') >= 1;
    const podeCair = aprimoramento.chances(card.rarity, nivel).queda > 0;

    const botoes = [
        new ButtonBuilder()
            .setCustomId('confirm_aprimorar')
            .setLabel(t('aprimorar.botao', { custo }))
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
                .setLabel(t('aprimorar.botao_protegido'))
                .setEmoji('🛡️')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(!temGema || !temPergaminho)
        );
    }

    botoes.push(
        new ButtonBuilder()
            .setCustomId('cancel_aprimorar')
            .setLabel(t('comum.cancelar'))
            .setStyle(ButtonStyle.Secondary)
    );

    return new ActionRowBuilder().addComponents(...botoes);
}

async function aprimorarRun(client, interaction, user, matchingCards, t = criarT(DEFAULT_LOCALE)) {
    await interaction.deferReply();

    const indexRef = { currentIndex: 0 };

    const rowNavigation = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('prev').setEmoji('◀️').setStyle(ButtonStyle.Secondary).setDisabled(matchingCards.length === 1),
        new ButtonBuilder().setCustomId('next').setEmoji('▶️').setStyle(ButtonStyle.Secondary).setDisabled(matchingCards.length === 1)
    );

    const message = await interaction.editReply({
        embeds: [montarEmbed(matchingCards[0], user, t)],
        components: [rowNavigation, montarBotoes(matchingCards[0], user, t)]
    });

    return { message, indexRef, rowNavigation };
}

module.exports = { aprimorarRun, montarEmbed, montarBotoes, linhaDeStats, pct };
