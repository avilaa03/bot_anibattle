const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const ui = require('./embeds');
const valores = require('./valores');

/**
 * Tela de "monte seu time": o embed e a grade de botões das cartas.
 *
 * ## Por que isto mora aqui e não no battleCollect
 *
 * O `/battle` e o `/treino` mostram exatamente a mesma tela — é a mesma
 * escolha, com as mesmas regras de ordem, os mesmos limites do Discord e
 * o mesmo botão de desistir. Enquanto isso vivia dentro do
 * `battleCollect.js`, o treino só teria duas saídas: duplicar a montagem
 * (e as duas telas divergirem na primeira mudança) ou importar o
 * `battleCollect`, que arrasta `battleState` e `economy` junto — o que
 * contraria a garantia de que o treino não toca em estado de jogo.
 *
 * Este módulo só desenha. Não sabe o que é uma batalha, não lê banco e
 * não decide nada: recebe o inventário e como nomear os botões, devolve
 * embed e componentes.
 *
 * ## 20 cartas, não 25
 *
 * O Discord permite 5 linhas de 5 botões numa mensagem. Com 25 cartas as
 * cinco linhas ficavam lotadas e não sobrava espaço para o botão de
 * desistir — ele simplesmente não aparecia, sem erro nenhum.
 *
 * 20 cartas deixam a quinta linha livre. Para escolher 3 do time, ver as
 * 20 melhores é mais que suficiente.
 */

const MAX_CARDS_SHOWN = 20;
const CARDS_PER_ROW = 5;

// Limites do Discord, usados na montagem dos botões.
const MAX_LINHAS = 5;
const MAX_BOTOES_POR_LINHA = 5;

const getOvr = valores.overallDaCarta;

/**
 * Ordena o inventário das melhores cartas para as piores. Como só cabem 25
 * botões, sem isso quem tem 200 cartas nunca conseguiria usar as melhores
 * — elas ficariam fora da janela visível.
 */
function ordenarParaBatalha(inventory) {
    return [...inventory].sort((a, b) => {
        const porRaridade = ui.compareRarityDesc(a.rarity, b.rarity);
        return porRaridade !== 0 ? porRaridade : getOvr(b) - getOvr(a);
    });
}

/** Linha de uma carta já escolhida, com posição e atributos. */
function linhaDoTime(card, i) {
    const meta = ui.getRarity(card.rarity);
    return `\`${i + 1}\` ${meta.emoji} **${ui.cardName(card.name)}**${ui.nivelTag(card.nivel)} — OVR ${getOvr(card)}\n`
        + `└ ⚔️ ${card.ATA ?? 0} · ❤️ ${card.LIF ?? 0} · 💥 ${card.POW ?? 0}`;
}

/**
 * Monta a tela de escolha.
 *
 * @param {object}   opcoes
 * @param {Array}    opcoes.inventory      cartas disponíveis
 * @param {Array}    opcoes.selectedIds    ids já escolhidos (ficam desativados)
 * @param {Array}    opcoes.deck           cartas do time, na ordem escolhida
 * @param {Function} opcoes.idEscolha      (cardId) => customId do botão da carta
 * @param {string}   opcoes.idCancelar     customId do botão de desistir
 * @param {string}   opcoes.rotuloCancelar texto do botão de desistir
 * @param {string}   opcoes.aguardando     descrição quando o time fecha
 * @param {Array}    opcoes.campos         campos extras do embed (aposta, rival...)
 * @returns {{ embed: object, components: Array }}
 */
function montarEscolhaDeTime({
    inventory = [],
    selectedIds = [],
    deck = [],
    idEscolha,
    idCancelar,
    rotuloCancelar = 'Desistir',
    aguardando = '✅ **Time completo!** Aguardando seu oponente escolher...',
    campos = []
}) {
    const selecionadas = new Set((selectedIds || []).map(String));
    const completo = deck.length === 3;

    const embed = ui.base(completo ? ui.STATUS_COLORS.success : ui.STATUS_COLORS.warning)
        .setTitle('⚔️ Monte seu time')
        .setDescription(
            completo
                ? aguardando
                : [
                    'Escolha **3 cartas** para batalhar.',
                    '',
                    `${'🔵'.repeat(deck.length)}${'⚪'.repeat(3 - deck.length)}  **${deck.length}/3**`,
                    '',
                    '💡 *A ordem importa: sua 1ª carta enfrenta a 1ª do oponente, a 2ª contra a 2ª, e assim por diante.*'
                ].join('\n')
        );

    for (const campo of campos) embed.addFields(campo);

    if (deck.length > 0) {
        embed.addFields({ name: 'Seu time', value: deck.map(linhaDoTime).join('\n') });
    }

    const cardsToShow = ordenarParaBatalha(inventory).slice(0, MAX_CARDS_SHOWN);

    if (inventory.length > MAX_CARDS_SHOWN) {
        embed.setFooter({ text: `${ui.BRAND} • Mostrando suas ${MAX_CARDS_SHOWN} melhores cartas de ${inventory.length}` });
    }

    const rows = [];
    for (let row = 0; row < Math.ceil(cardsToShow.length / CARDS_PER_ROW); row++) {
        const actionRow = new ActionRowBuilder();
        for (let col = 0; col < CARDS_PER_ROW; col++) {
            const index = row * CARDS_PER_ROW + col;
            if (index >= cardsToShow.length) break;
            const card = cardsToShow[index];
            const cardId = String(card._id);
            const isSelected = selecionadas.has(cardId);
            const meta = ui.getRarity(card.rarity);
            const nomeCurto = card.name.length > 60 ? card.name.slice(0, 57) + '…' : card.name;
            const label = `${nomeCurto} · ${getOvr(card)}`;
            actionRow.addComponents(
                new ButtonBuilder()
                    // O customId carrega o _id da carta, não o índice: assim a
                    // escolha não "escorrega" se o inventário mudar no meio.
                    .setCustomId(idEscolha(cardId))
                    .setLabel(label.slice(0, 80))
                    .setEmoji(meta.emoji)
                    .setStyle(isSelected ? ButtonStyle.Success : ButtonStyle.Secondary)
                    .setDisabled(isSelected)
            );
        }
        rows.push(actionRow);
    }

    // Saída durante a escolha do time.
    //
    // No `/battle`, sem isso quem desafiava e via o oponente sumir ficava
    // com a aposta retida até a varredura passar. Cancelar ali devolve a
    // aposta aos dois na hora.
    //
    // Entra na última linha se couber; senão abre uma linha nova. Com
    // MAX_CARDS_SHOWN em 20 sempre sobra espaço, mas a conta fica aqui
    // para o botão não sumir em silêncio se alguém mexer nas constantes.
    const botaoDesistir = new ButtonBuilder()
        .setCustomId(idCancelar)
        .setLabel(rotuloCancelar)
        .setEmoji('🚫')
        .setStyle(ButtonStyle.Danger);

    const ultima = rows[rows.length - 1];
    if (ultima && ultima.components.length < MAX_BOTOES_POR_LINHA) {
        ultima.addComponents(botaoDesistir);
    } else if (rows.length < MAX_LINHAS) {
        rows.push(new ActionRowBuilder().addComponents(botaoDesistir));
    } else {
        // Não deveria acontecer. Se acontecer, é erro de configuração e
        // precisa gritar — botão de desistir sumido deixa aposta presa.
        console.error(
            '[escolhaDeTime] Sem espaço para o botão de desistir. '
            + `MAX_CARDS_SHOWN (${MAX_CARDS_SHOWN}) ocupa todas as ${MAX_LINHAS} linhas do Discord.`
        );
    }

    return { embed, components: rows };
}

module.exports = {
    MAX_CARDS_SHOWN,
    CARDS_PER_ROW,
    MAX_LINHAS,
    MAX_BOTOES_POR_LINHA,
    getOvr,
    ordenarParaBatalha,
    linhaDoTime,
    montarEscolhaDeTime
};
