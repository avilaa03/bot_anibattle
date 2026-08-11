const { MessageFlags } = require('discord.js');
const ui = require('../utils/embeds');
const treino = require('../utils/treino');
const treinoRun = require('../actions/run/treinoRun');
const { tDaInteracao } = require('../utils/idioma');

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

    const t = await tDaInteracao(interaction);

    const sessao = treino.getSessao(sessaoId);
    if (!sessao) {
        await avisar(interaction, ui.neutral(t('treino.encerrado'), t('treino.encerrado_texto')));
        return true;
    }
    if (sessao.userId !== interaction.user.id) {
        await avisar(interaction, ui.error(t('treino.nao_e_seu'), t('treino.nao_e_seu_texto')));
        return true;
    }

    const carta = sessao.inventario.find((c) => String(c._id) === cartaId);
    if (!carta) {
        await avisar(interaction, ui.error(t('treino.carta_indisponivel'), t('battle.carta_fora_do_inventario')));
        return true;
    }

    await interaction.deferUpdate().catch(() => {});

    const escolha = treino.escolherCarta(sessaoId, carta);
    if (!escolha.ok) {
        // O motivo é código, não frase: a chave é que decide o texto, e um
        // motivo novo sem tradução aparece na tela como a própria chave —
        // feio o bastante para ser achado antes de chegar ao jogador.
        await avisar(interaction, ui.neutral(
            t('treino.nada_a_fazer'),
            t(`treino.recusa.${escolha.motivo}`)
        ));
        return true;
    }

    // Redesenha a tela com a carta marcada. Com o time fechado os botões
    // saem: as cartas não escolhidas continuariam clicáveis e o jogador
    // levaria um "treino encerrado" no rosto por clicar no que a tela
    // ainda estava oferecendo.
    const tela = treinoRun.telaDeEscolha(sessao, t);
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
    const t = await tDaInteracao(interaction);
    const sessao = treino.getSessao(sessaoId);

    if (!sessao || sessao.userId !== interaction.user.id) {
        await avisar(interaction, ui.neutral(t('treino.nada_para_cancelar'), t('treino.nada_para_cancelar_texto')));
        return true;
    }

    treino.encerrarSessao(sessaoId);

    await interaction.update({
        content: null,
        embeds: [ui.neutral(t('treino.cancelado'), t('treino.cancelado_texto'))],
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
