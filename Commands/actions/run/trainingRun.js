const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const User = require('../../utils/userSchema');
const ui = require('../../utils/embeds');
const { runBattle } = require('../../utils/battleEngine');
const { montarEscolhaDeTime } = require('../../utils/teamPicker');
const { montarEmbedResultado, contarDestaques } = require('../../utils/battleResult');
const treino = require('../../utils/training');
const transmissao = require('../../utils/broadcast');
const { criarT } = require('../../utils/i18n');
const { tDaInteracao } = require('../../utils/language');

/**
 * /treino — a batalha de verdade, contra o BOT Caviar.
 *
 * ## É a mesma batalha
 *
 * Mesmo motor (`runBattle`), mesma tela de escolha de time, mesma
 * narração ao vivo no canal, mesma tela final. O jogador escolhe as três
 * cartas dele no privado, exatamente como no `/battle`; o que muda é que
 * o adversário é um time sorteado do catálogo em vez de outro jogador.
 *
 * Isso é o ponto: se o treino usasse um caminho próprio, ele deixaria de
 * prever como a batalha real se comporta — e prever é o único motivo dele
 * existir.
 *
 * ## Não vale nada, e isso é o recurso
 *
 * Nenhuma moeda muda de mão, o ELO não se move, missão e conquista não
 * contam, e nenhuma carta é ganha ou perdida.
 *
 * Por isso este arquivo NÃO importa `economy`, `elo`, `progresso` nem
 * `battleState`. A única leitura no banco é o inventário do jogador e o
 * catálogo (para sortear o rival). Há uma verificação em
 * `tests/convencoes.test.js` que falha se alguém adicionar um desses
 * imports — o risco real não é hoje, é daqui a seis meses, quando parecer
 * natural "só contar o treino nas estatísticas".
 *
 * ## Por que não há `validarPosse` aqui
 *
 * O `/battle` reconfere no banco, na hora de resolver, se o jogador ainda
 * tem as três cartas que escolheu — senão dava para escolher o time,
 * vender as cartas no mercado e mesmo assim batalhar com elas. Ali isso
 * importa porque tem aposta e ELO em jogo.
 *
 * No treino não há o que ganhar vendendo a carta antes da luta. A
 * verificação só custaria uma consulta e criaria um jeito novo de o
 * treino falhar, sem proteger nada.
 */

/**
 * Cooldown curto, só para não virar despejo de mensagem no canal — a
 * transmissão da luta é pública. Como nada é ganho, não há o que farmar.
 *
 * Ele é marcado depois das validações: quem tem 2 cartas não pode levar
 * 20 s de espera por uma tentativa que sequer chegou a começar.
 */
const COOLDOWN_MS = 20 * 1000;
const ultimoTreino = new Map();

/** O time do BOT aparece na tela de escolha, para o jogador escalar contra ele. */
function campoTimeRival(sessao, t) {
    const linhas = sessao.timeRival.map((c, i) => {
        const meta = ui.getRarity(c.rarity, t.locale);
        return `\`${i + 1}\` ${meta.emoji} **${ui.cardName(c)}** — ${t('atributos.ovr')} ${c.overall ?? 0}\n`
            + `└ ⚔️ ${c.ATA ?? 0} · ❤️ ${c.LIF ?? 0} · 💥 ${c.POW ?? 0}`;
    }).join('\n');

    const dificuldade = treino.localizarDificuldade(sessao.dificuldade, t.locale);

    return {
        name: t('treino.time_rival', {
            rival: treino.NOME_RIVAL,
            emoji: dificuldade.emoji,
            dificuldade: dificuldade.nome
        }),
        value: `${linhas}\n\n*${t('treino.ordem_dos_confrontos')}*`,
        inline: false
    };
}

/** Tela de "monte seu time" do treino. Mesma do /battle, com o rival à vista. */
function telaDeEscolha(sessao, t = criarT(sessao.locale)) {
    return montarEscolhaDeTime({
        inventory: sessao.inventario,
        selectedIds: sessao.selectedIds,
        deck: sessao.deck,
        idEscolha: (cardId) => `treino_pick_${sessao.id}_${cardId}`,
        idCancelar: `treino_cancel_${sessao.id}`,
        rotuloCancelar: t('treino.botao_cancelar'),
        aguardando: t('treino.time_completo'),
        campos: [campoTimeRival(sessao, t)],
        t
    });
}

function botoesDoResultado(dificuldade, t) {
    return [new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`treino_novo_${dificuldade}`)
            .setLabel(t('treino.botao_de_novo'))
            .setEmoji('🔁')
            .setStyle(ButtonStyle.Secondary)
    )];
}

/**
 * Abre um treino: sorteia o rival e manda a escolha de time no privado.
 *
 * A escolha vai para o privado igual à do `/battle`. Contra um BOT não
 * haveria segredo a proteger, mas é justamente esse caminho — abrir DM,
 * responder botão fora do canal de origem — que o treino serve para
 * exercitar.
 */
async function iniciarTreino(client, interaction, dificuldade) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const t = await tDaInteracao(interaction);

    const recusar = (tituloChave, descricaoChave, valores) =>
        interaction.editReply({
            embeds: [ui.error(t(tituloChave), t(descricaoChave, valores))]
        }).catch(() => {});

    const emAndamento = treino.getSessaoDoUsuario(interaction.user.id);
    if (emAndamento) {
        return recusar('treino.em_andamento', 'treino.em_andamento_texto');
    }

    const agora = Date.now();
    const ultimo = ultimoTreino.get(interaction.user.id) || 0;
    if (agora - ultimo < COOLDOWN_MS) {
        return recusar('treino.calma_la', 'treino.calma_la_texto', {
            tempo: ui.duration(COOLDOWN_MS - (agora - ultimo), t.locale)
        });
    }

    const doc = await User.findOne({ id: interaction.user.id }).select('inventory').lean();
    const inventario = doc?.inventory || [];

    if (inventario.length < 3) {
        return recusar('treino.time_incompleto', 'treino.time_incompleto_texto', { n: inventario.length });
    }

    const montagem = await treino.montarTimeRival(inventario, dificuldade);
    if (!montagem.ok) {
        return recusar('treino.catalogo_vazio', 'treino.catalogo_vazio_texto', { rival: treino.NOME_RIVAL });
    }

    // Passou por tudo: agora sim o cooldown conta.
    ultimoTreino.set(interaction.user.id, agora);

    const sessao = treino.criarSessao({
        userId: interaction.user.id,
        username: interaction.user.username,
        inventario,
        timeRival: montagem.timeRival,
        dificuldade: montagem.dificuldade,
        canalId: interaction.channelId,
        locale: t.locale
    });

    const tela = telaDeEscolha(sessao, t);

    try {
        const dm = await interaction.user.send({
            content: t('treino.dm_monte_time', { rival: treino.NOME_RIVAL }),
            embeds: [tela.embed],
            components: tela.components
        });
        treino.registrarMensagem(sessao.id, dm.id, dm.channel.id);
    } catch {
        // Privado fechado. Sem sessão pendurada e sem cooldown gasto: o
        // jogador arruma a configuração e tenta de novo na hora.
        treino.encerrarSessao(sessao.id);
        ultimoTreino.delete(interaction.user.id);
        return recusar('treino.sem_privado', 'treino.sem_privado_texto');
    }

    const nivel = treino.localizarDificuldade(montagem.dificuldade, t.locale);

    return interaction.editReply({
        embeds: [ui.info(
            t('treino.aberto'),
            t('treino.aberto_texto', {
                rival: treino.NOME_RIVAL,
                emoji: nivel.emoji,
                dificuldade: nivel.nome
            })
        )]
    }).catch(() => {});
}

/**
 * Resolve a luta e transmite.
 *
 * A batalha inteira é calculada aqui, de uma vez, antes de qualquer
 * animação aparecer — mesmo princípio do `/battle`: a transmissão é
 * enfeite sobre um fato consumado, e pode falhar sem consequência.
 */
async function resolverTreino(client, sessao) {
    // O idioma vem da sessão: aqui não existe interação nenhuma — a luta
    // resolve sozinha quando a terceira carta é escolhida.
    const t = criarT(sessao.locale);

    const resultado = runBattle(sessao.deck, sessao.timeRival);
    const nomeJogador = sessao.username;

    // O canal de origem é onde a luta é transmitida, igual ao `/battle`.
    // Se ele sumiu (canal apagado, bot removido), cai para o privado —
    // melhor transmitir no lugar errado do que engolir o resultado.
    const canalOrigem = await client.channels.fetch(sessao.canalId).catch(() => null);
    const canalPrivado = sessao.mensagemCanalId
        ? await client.channels.fetch(sessao.mensagemCanalId).catch(() => null)
        : null;
    const canal = canalOrigem || canalPrivado;

    const embed = montarEmbedResultado({
        nomeX: nomeJogador,
        nomeY: treino.NOME_RIVAL,
        resultado,
        t
    });

    const { criticos, viradas } = contarDestaques(resultado);
    if (criticos > 0 || viradas > 0) {
        embed.addFields({
            name: t('treino.da_luta'),
            value: t('treino.da_luta_texto', { criticos, viradas }),
            inline: false
        });
    }

    embed.setFooter({ text: `${ui.BRAND} • ${t('treino.nao_vale_nada')}` });

    if (canal) {
        try {
            await transmissao.transmitir({
                canal,
                nomeX: nomeJogador,
                nomeY: treino.NOME_RIVAL,
                mencao: t('treino.mencao_transmissao', { jogador: `<@${sessao.userId}>` }),
                resultado,
                wager: 0,
                t
            });
        } catch (err) {
            // Nunca deixar a animação derrubar a entrega do resultado.
            console.error('Erro na transmissão do treino (resultado não afetado):', err.message);
        }

        await canal.send({
            content: `<@${sessao.userId}>`,
            embeds: [embed],
            components: botoesDoResultado(sessao.dificuldade.chave, t)
        }).catch(() => {});
    }

    treino.encerrarSessao(sessao.id);
    return { resultado, canal };
}

async function treinoRun(client, interaction) {
    const dificuldade = interaction.options?.getString?.('difficulty') || treino.PADRAO;
    return iniciarTreino(client, interaction, dificuldade);
}

module.exports = treinoRun;
module.exports.iniciarTreino = iniciarTreino;
module.exports.resolverTreino = resolverTreino;
module.exports.telaDeEscolha = telaDeEscolha;
module.exports.botoesDoResultado = botoesDoResultado;
module.exports.COOLDOWN_MS = COOLDOWN_MS;
