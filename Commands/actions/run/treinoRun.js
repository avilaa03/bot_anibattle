const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const User = require('../../utils/userSchema');
const ui = require('../../utils/embeds');
const { runBattle } = require('../../utils/battleEngine');
const { montarEscolhaDeTime } = require('../../utils/escolhaDeTime');
const { montarEmbedResultado, contarDestaques } = require('../../utils/resultadoBatalha');
const treino = require('../../utils/treino');
const transmissao = require('../../utils/transmissao');

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
function campoTimeRival(sessao) {
    const linhas = sessao.timeRival.map((c, i) => {
        const meta = ui.getRarity(c.rarity);
        return `\`${i + 1}\` ${meta.emoji} **${ui.cardName(c)}** — OVR ${c.overall ?? 0}\n`
            + `└ ⚔️ ${c.ATA ?? 0} · ❤️ ${c.LIF ?? 0} · 💥 ${c.POW ?? 0}`;
    }).join('\n');

    return {
        name: `🤖 Time do ${treino.NOME_RIVAL} — ${sessao.dificuldade.emoji} ${sessao.dificuldade.nome}`,
        value: `${linhas}\n\n*Sua 1ª carta enfrenta a 1ª dele, e assim por diante.*`,
        inline: false
    };
}

/** Tela de "monte seu time" do treino. Mesma do /battle, com o rival à vista. */
function telaDeEscolha(sessao) {
    return montarEscolhaDeTime({
        inventory: sessao.inventario,
        selectedIds: sessao.selectedIds,
        deck: sessao.deck,
        idEscolha: (cardId) => `treino_pick_${sessao.id}_${cardId}`,
        idCancelar: `treino_cancel_${sessao.id}`,
        rotuloCancelar: 'Cancelar treino',
        aguardando: '✅ **Time completo!** A luta vai começar...',
        campos: [campoTimeRival(sessao)]
    });
}

function botoesDoResultado(dificuldade) {
    return [new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`treino_novo_${dificuldade}`)
            .setLabel('Treinar de novo')
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

    const recusar = (titulo, descricao) =>
        interaction.editReply({ embeds: [ui.error(titulo, descricao)] }).catch(() => {});

    const emAndamento = treino.getSessaoDoUsuario(interaction.user.id);
    if (emAndamento) {
        return recusar(
            'Treino em andamento',
            'Você já tem um treino aberto no privado. Termine ou cancele ele antes de começar outro.'
        );
    }

    const agora = Date.now();
    const ultimo = ultimoTreino.get(interaction.user.id) || 0;
    if (agora - ultimo < COOLDOWN_MS) {
        return recusar('Calma lá', `Espere ${ui.duration(COOLDOWN_MS - (agora - ultimo))} para treinar de novo.`);
    }

    const doc = await User.findOne({ id: interaction.user.id }).select('inventory').lean();
    const inventario = doc?.inventory || [];

    if (inventario.length < 3) {
        return recusar(
            'Time incompleto',
            `Você precisa de pelo menos **3 cartas** para treinar. Tem ${inventario.length}.\n\nUse \`/roll\` para conseguir mais.`
        );
    }

    const montagem = await treino.montarTimeRival(inventario, dificuldade);
    if (!montagem.ok) {
        return recusar('Catálogo vazio', `Não há cartas cadastradas para o ${treino.NOME_RIVAL} usar.`);
    }

    // Passou por tudo: agora sim o cooldown conta.
    ultimoTreino.set(interaction.user.id, agora);

    const sessao = treino.criarSessao({
        userId: interaction.user.id,
        username: interaction.user.username,
        inventario,
        timeRival: montagem.timeRival,
        dificuldade: montagem.dificuldade,
        canalId: interaction.channelId
    });

    const tela = telaDeEscolha(sessao);

    try {
        const dm = await interaction.user.send({
            content: `🥊 Treino contra **${treino.NOME_RIVAL}** — monte seu time!`,
            embeds: [tela.embed],
            components: tela.components
        });
        treino.registrarMensagem(sessao.id, dm.id, dm.channel.id);
    } catch {
        // Privado fechado. Sem sessão pendurada e sem cooldown gasto: o
        // jogador arruma a configuração e tenta de novo na hora.
        treino.encerrarSessao(sessao.id);
        ultimoTreino.delete(interaction.user.id);
        return recusar(
            'Não consegui te chamar no privado',
            'Habilite as mensagens diretas deste servidor para montar seu time.'
        );
    }

    return interaction.editReply({
        embeds: [ui.info(
            '🥊 Treino aberto',
            `Te mandei no privado a tela para montar seu time contra o **${treino.NOME_RIVAL}**`
            + ` (${montagem.dificuldade.emoji} ${montagem.dificuldade.nome}).\n\n`
            + 'A luta é transmitida aqui no canal quando você fechar as 3 cartas.'
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
        resultado
    });

    const { criticos, viradas } = contarDestaques(resultado);
    if (criticos > 0 || viradas > 0) {
        embed.addFields({
            name: 'Da luta',
            value: `💥 ${criticos} crítico(s) • 🔥 ${viradas} virada(s)`,
            inline: false
        });
    }

    embed.setFooter({ text: `${ui.BRAND} • Treino não vale moeda, ELO nem conquista` });

    if (canal) {
        try {
            await transmissao.transmitir({
                canal,
                nomeX: nomeJogador,
                nomeY: treino.NOME_RIVAL,
                mencao: `<@${sessao.userId}> 🥊 treino`,
                resultado,
                wager: 0
            });
        } catch (err) {
            // Nunca deixar a animação derrubar a entrega do resultado.
            console.error('Erro na transmissão do treino (resultado não afetado):', err.message);
        }

        await canal.send({
            content: `<@${sessao.userId}>`,
            embeds: [embed],
            components: botoesDoResultado(sessao.dificuldade.chave)
        }).catch(() => {});
    }

    treino.encerrarSessao(sessao.id);
    return { resultado, canal };
}

async function treinoRun(client, interaction) {
    const dificuldade = interaction.options?.getString?.('dificuldade') || treino.PADRAO;
    return iniciarTreino(client, interaction, dificuldade);
}

module.exports = treinoRun;
module.exports.iniciarTreino = iniciarTreino;
module.exports.resolverTreino = resolverTreino;
module.exports.telaDeEscolha = telaDeEscolha;
module.exports.botoesDoResultado = botoesDoResultado;
module.exports.COOLDOWN_MS = COOLDOWN_MS;
