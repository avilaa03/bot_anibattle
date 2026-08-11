const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const ui = require('../../utils/embeds');
const itens = require('../../utils/items');
const valores = require('../../utils/cardValues');
const { criarT, DEFAULT_LOCALE } = require('../../utils/i18n');

/**
 * /desmanchar — a carta vira gema em vez de moeda.
 *
 * ## Por que ele existe
 *
 * A Comum sai em 64% dos rolls e a venda rápida dela paga ~30 moedas. Sem
 * um segundo destino, a maior parte do que o jogador tira é lixo com
 * passo extra.
 *
 * Desmanchar dá o terceiro destino: vender por moeda, guardar para a
 * Pokédex, ou virar material. E como ele NÃO cria moeda, cada carta
 * desmanchada é uma venda rápida que deixou de imprimir dinheiro — a
 * mesma torneira de inflação que a tabela de valores já tinha apertado.
 *
 * ## Por que a Mestra continua valendo mais vendida
 *
 * A tabela de gemas é achatada de propósito (`utils/itens.js`): na Mestra,
 * a venda rápida ainda ganha do desmanche. É o que impede o jogo de
 * empurrar alguém a picotar a carta mais rara que tem — e há teste que
 * falha se essa relação se inverter.
 */

function gemasDe(card) {
    return itens.gemasDoDesmanche(card.rarity);
}

function valorDeVendaDe(card) {
    return card.valueToSell ?? valores.valoresDaCarta(card).valueToSell;
}

/**
 * @param {object} card
 * @param {number} copias quantas cópias desta MESMA carta o jogador tem
 */
/**
 * "1 gema" / "3 gemas", no idioma certo.
 *
 * A escolha de singular e plural fica no código porque a REGRA é do
 * idioma, não da frase: escrever "gema(s)" no dicionário resolveria o
 * português e ficaria estranho em inglês, e um dicionário com a forma já
 * flexionada não teria como saber o número.
 */
function contarGemas(n, t) {
    return t(n === 1 ? 'desmanchar.uma_gema' : 'desmanchar.varias_gemas', {
        n: ui.number(n, t.locale)
    });
}

function updateEmbed(card, copias = 1, t = criarT(DEFAULT_LOCALE)) {
    const gemas = gemasDe(card);
    const meta = ui.getRarity(card.rarity, t.locale);
    const item = itens.localizarPorChave('gema', t.locale);
    const vendaRapida = valorDeVendaDe(card);

    const linhas = [
        `${meta.emoji} ${ui.rarityTag(card.rarity, t.locale)} • *${card.series || t('comum.traco')}*`,
        '',
        ui.statLines(card, t.locale),
        '',
        t('desmanchar.vira_gemas', { emoji: item.emoji, gemas: contarGemas(gemas, t) }),
        t('desmanchar.quicksell_pagaria', { valor: ui.coins(vendaRapida, t.locale) })
    ];

    // A comparação fica à vista porque a resposta muda com a raridade: na
    // Mestra, vender é o melhor negócio, e o jogador precisa saber disso
    // ANTES de destruir a carta, não depois.
    const valendo = gemas * itens.PRECO_GEMA;
    linhas.push(t(
        valendo > vendaRapida ? 'desmanchar.compensa' : 'desmanchar.nao_compensa',
        { valor: ui.coins(valendo, t.locale) }
    ));

    if (copias <= 1) {
        linhas.push('', t('desmanchar.unica_copia'));
    }
    linhas.push(`*${t('desmanchar.irreversivel')}*`);
    linhas.push(`*${t('desmanchar.pokedex_guarda')}*`);

    const embed = ui.base(meta.color)
        .setTitle(t('desmanchar.titulo', { carta: ui.cardName(card) }))
        .setDescription(linhas.join('\n'));

    if (card.characterImage) embed.setThumbnail(card.characterImage);
    else if (card.baseImage) embed.setThumbnail(card.baseImage);
    return embed;
}

function buildConfirmationRow(card, t = criarT(DEFAULT_LOCALE)) {
    const gemas = gemasDe(card);
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('confirm_desmanchar')
            .setLabel(t('desmanchar.botao', { gemas: contarGemas(gemas, t) }))
            .setEmoji('💎')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId('cancel_desmanchar')
            .setLabel(t('comum.cancelar'))
            .setStyle(ButtonStyle.Secondary)
    );
}

/** Quantas cópias da mesma carta do catálogo o jogador tem. */
function contarCopias(user, card) {
    const alvo = String(card.originalCardId ?? card.cardId ?? '');
    return user.inventory.filter((c) => String(c.originalCardId ?? c.cardId ?? '') === alvo).length;
}

async function desmancharRun(client, interaction, user, matchingCards, t = criarT(DEFAULT_LOCALE)) {
    await interaction.deferReply();

    const indexRef = { currentIndex: 0 };

    const rowNavigation = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('prev').setEmoji('◀️').setStyle(ButtonStyle.Secondary).setDisabled(matchingCards.length === 1),
        new ButtonBuilder().setCustomId('next').setEmoji('▶️').setStyle(ButtonStyle.Secondary).setDisabled(matchingCards.length === 1)
    );

    const message = await interaction.editReply({
        embeds: [updateEmbed(matchingCards[0], contarCopias(user, matchingCards[0]), t)],
        components: [rowNavigation, buildConfirmationRow(matchingCards[0], t)]
    });

    return { message, indexRef, rowNavigation };
}

module.exports = { desmancharRun, updateEmbed, buildConfirmationRow, gemasDe, contarCopias, contarGemas };
