const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const ui = require('../../utils/embeds');
const itens = require('../../utils/itens');
const valores = require('../../utils/valores');

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
function updateEmbed(card, copias = 1) {
    const gemas = gemasDe(card);
    const meta = ui.getRarity(card.rarity);
    const item = itens.getItem('gema');
    const vendaRapida = valorDeVendaDe(card);

    const linhas = [
        `${meta.emoji} ${ui.rarityTag(card.rarity)} • *${card.series || '—'}*`,
        '',
        ui.statLines(card),
        '',
        `Vira ${item.emoji} **${ui.number(gemas)} ${gemas === 1 ? 'gema' : 'gemas'}**.`,
        `Vendida no \`/quicksell\` pagaria ${ui.coins(vendaRapida)}.`
    ];

    // A comparação fica à vista porque a resposta muda com a raridade: na
    // Mestra, vender é o melhor negócio, e o jogador precisa saber disso
    // ANTES de destruir a carta, não depois.
    const valendo = gemas * itens.PRECO_GEMA;
    if (valendo > vendaRapida) {
        linhas.push(`> 💡 *Em gema você leva o equivalente a ${ui.coins(valendo)} na loja — desmanchar rende mais.*`);
    } else {
        linhas.push(`> ⚠️ *Em gema o equivalente é ${ui.coins(valendo)} na loja — **vender paga melhor** nesta carta.*`);
    }

    if (copias <= 1) {
        linhas.push('', '⚠️ **É a sua única cópia desta carta.**');
    }
    linhas.push('*A carta é destruída e não pode ser recuperada.*');
    linhas.push('*A Pokédex guarda a descoberta — ela continua registrada.*');

    const embed = ui.base(meta.color)
        .setTitle(`🔨 Desmanchar ${ui.cardName(card.name)}?`)
        .setDescription(linhas.join('\n'));

    if (card.characterImage) embed.setThumbnail(card.characterImage);
    else if (card.baseImage) embed.setThumbnail(card.baseImage);
    return embed;
}

function buildConfirmationRow(card) {
    const gemas = gemasDe(card);
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('confirm_desmanchar')
            .setLabel(`Desmanchar por ${ui.number(gemas)} ${gemas === 1 ? 'gema' : 'gemas'}`)
            .setEmoji('💎')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId('cancel_desmanchar')
            .setLabel('Cancelar')
            .setStyle(ButtonStyle.Secondary)
    );
}

/** Quantas cópias da mesma carta do catálogo o jogador tem. */
function contarCopias(user, card) {
    const alvo = String(card.originalCardId ?? card.cardId ?? '');
    return user.inventory.filter((c) => String(c.originalCardId ?? c.cardId ?? '') === alvo).length;
}

async function desmancharRun(client, interaction, user, matchingCards) {
    await interaction.deferReply();

    const indexRef = { currentIndex: 0 };

    const rowNavigation = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('prev').setEmoji('◀️').setStyle(ButtonStyle.Secondary).setDisabled(matchingCards.length === 1),
        new ButtonBuilder().setCustomId('next').setEmoji('▶️').setStyle(ButtonStyle.Secondary).setDisabled(matchingCards.length === 1)
    );

    const message = await interaction.editReply({
        embeds: [updateEmbed(matchingCards[0], contarCopias(user, matchingCards[0]))],
        components: [rowNavigation, buildConfirmationRow(matchingCards[0])]
    });

    return { message, indexRef, rowNavigation };
}

module.exports = { desmancharRun, updateEmbed, buildConfirmationRow, gemasDe, contarCopias };
