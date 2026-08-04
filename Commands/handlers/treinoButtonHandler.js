const { MessageFlags } = require('discord.js');
const ui = require('../utils/embeds');
const treino = require('../utils/treino');
const treinoRun = require('../actions/run/treinoRun');

/**
 * Botões do modo treino.
 *
 * customIds:
 *   treino_pick_<sessaoId>_<cardId>  escolhe uma carta do time
 *   treino_cancel_<sessaoId>         desiste antes da luta
 *   treino_novo_<dificuldade>        recomeça, a partir da tela final
 *
 * ## A ordem dos prefixos importa
 *
 * `treino_` é o prefixo de todos eles, e o roteador do `index.js` manda
 * tudo que começa assim para cá. Antes de existir escolha de time havia
 * só o `treino_<dificuldade>`, lido com um `slice` do prefixo — se algum
 * botão novo entrar por lá, a dificuldade vira "pick_abc123" em silêncio
 * e o treino cai no padrão sem ninguém notar. Por isso cada ação tem
 * agora um prefixo próprio e explícito.
 *
 * ## Não vale nada
 *
 * Vale aqui a mesma regra do `treino.js` e do `treinoRun.js`: este
 * arquivo não pode importar `economy`, `elo`, `progresso` nem
 * `battleState`. `tests/convencoes.test.js` verifica.
 */

const PREFIXO = 'treino_';

async function avisar(interaction, embed) {
    const payload = { embeds: [embed], flags: MessageFlags.Ephemeral };
    const resposta = interaction.deferred || interaction.replied
        ? interaction.followUp(payload)
        : interaction.reply(payload);
    return resposta.catch(() => {});
}

/**
 * Escolha de uma carta.
 *
 * Só o dono da sessão passa: o botão vive no privado dele, mas um
 * customId é público para quem o vê e não custa nada conferir.
 */
async function escolherCarta(client, interaction, resto) {
    const separador = resto.indexOf('_');
    if (separador < 0) return false;

    const sessaoId = resto.slice(0, separador);
    const cartaId = resto.slice(separador + 1);

    const sessao = treino.getSessao(sessaoId);
    if (!sessao) {
        await avisar(interaction, ui.neutral('Treino encerrado', 'Este treino expirou ou já foi resolvido. Use `/treino` para abrir outro.'));
        return true;
    }
    if (sessao.userId !== interaction.user.id) {
        await avisar(interaction, ui.error('Não é o seu treino', 'Este treino é de outra pessoa.'));
        return true;
    }

    const carta = sessao.inventario.find((c) => String(c._id) === cartaId);
    if (!carta) {
        await avisar(interaction, ui.error('Carta indisponível', 'Essa carta não está mais no seu inventário.'));
        return true;
    }

    await interaction.deferUpdate().catch(() => {});

    const escolha = treino.escolherCarta(sessaoId, carta);
    if (!escolha.ok) {
        const mensagens = {
            SESSAO_EXPIRADA: 'Este treino expirou. Use `/treino` para abrir outro.',
            TIME_CHEIO: 'Seu time já tem 3 cartas.',
            JA_ESCOLHIDA: 'Você já escolheu esta carta.'
        };
        await avisar(interaction, ui.neutral('Nada a fazer', mensagens[escolha.motivo] || 'Não deu para escolher esta carta.'));
        return true;
    }

    // Redesenha a tela com a carta marcada. Com o time fechado os botões
    // saem: as cartas não escolhidas continuariam clicáveis e o jogador
    // levaria um "treino encerrado" no rosto por clicar no que a tela
    // ainda estava oferecendo.
    const tela = treinoRun.telaDeEscolha(sessao);
    await interaction.editReply({
        embeds: [tela.embed],
        components: escolha.completo ? [] : tela.components
    }).catch(() => {});

    if (!escolha.completo) return true;

    // Trava a sessão: se dois cliques na terceira carta chegarem juntos,
    // só um resolve, e o canal não recebe a luta duas vezes.
    const reservada = treino.reservarParaResolver(sessaoId);
    if (!reservada) return true;

    await treinoRun.resolverTreino(client, reservada);
    return true;
}

async function cancelar(client, interaction, sessaoId) {
    const sessao = treino.getSessao(sessaoId);

    if (!sessao || sessao.userId !== interaction.user.id) {
        await avisar(interaction, ui.neutral('Nada para cancelar', 'Este treino já terminou ou expirou.'));
        return true;
    }

    treino.encerrarSessao(sessaoId);

    await interaction.update({
        content: null,
        embeds: [ui.neutral('Treino cancelado', 'Nenhuma luta aconteceu. Use `/treino` quando quiser tentar de novo.')],
        components: []
    }).catch(() => {});

    return true;
}

async function handleTreinoButton(client, interaction) {
    const id = interaction.customId;
    if (!id.startsWith(PREFIXO)) return false;

    const resto = id.slice(PREFIXO.length);

    if (resto.startsWith('pick_')) {
        return escolherCarta(client, interaction, resto.slice('pick_'.length));
    }
    if (resto.startsWith('cancel_')) {
        return cancelar(client, interaction, resto.slice('cancel_'.length));
    }
    if (resto.startsWith('novo_')) {
        const dificuldade = resto.slice('novo_'.length);
        await treinoRun.iniciarTreino(client, interaction, dificuldade);
        return true;
    }

    return false;
}

module.exports = { handleTreinoButton, PREFIXO };
