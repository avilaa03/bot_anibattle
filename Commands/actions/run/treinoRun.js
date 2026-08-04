const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const User = require('../../utils/userSchema');
const ui = require('../../utils/embeds');
const { runBattle } = require('../../utils/battleEngine');
const treino = require('../../utils/treino');
const transmissao = require('../../utils/transmissao');

/**
 * /treino — luta de teste contra o BOT Caviar.
 *
 * ## Não vale nada, e isso é o recurso
 *
 * Nenhuma moeda muda de mão, o ELO não se move, missão e conquista não
 * contam, e nenhuma carta é ganha ou perdida. Serve para você ver como
 * seu time se comporta antes de apostar de verdade.
 *
 * Por isso este arquivo NÃO importa `economy`, `elo`, `progresso` nem
 * `battleState`. A única leitura no banco é o inventário do jogador e o
 * catálogo (para sortear o rival). Há uma verificação em
 * `tests/convencoes.test.js` que falha se alguém adicionar um desses
 * imports — o risco real não é hoje, é daqui a seis meses, quando parecer
 * natural "só contar o treino nas estatísticas".
 *
 * ## Por que o cooldown é de brincadeira
 *
 * Existe um cooldown curto só para não virar despejo de mensagem no
 * canal. Como nada é ganho, não há o que farmar.
 */

const COOLDOWN_MS = 20 * 1000;
const ultimoTreino = new Map();

function embedResultado(resultado, nomeJogador, config) {
    const venceu = resultado.winner === 'X';
    const empate = resultado.winner === null;

    const cor = empate ? ui.STATUS_COLORS.neutral : venceu ? 0x4CAF50 : 0xE53935;
    const titulo = empate ? '🤝 Empate no treino' : venceu ? '✅ Você venceu o treino' : '❌ O BOT Caviar venceu';

    const embed = ui.base(cor)
        .setTitle(titulo)
        .setDescription(
            `**${nomeJogador}** ${resultado.winsX} — ${resultado.winsY} **${treino.NOME_RIVAL}**\n`
            + `Dificuldade: ${config.emoji} ${config.nome}`
        );

    const rodadas = resultado.rounds.map((r) => {
        const ganhou = r.winner === 'A';
        return `\`R${r.round}\` ${ganhou ? '🟢' : '🔴'} **${ui.cardName(r.cardX)}** vs **${ui.cardName(r.cardY)}**`;
    }).join('\n');

    embed.addFields({ name: 'Rodadas', value: rodadas.slice(0, 1024), inline: false });

    // A contagem de críticos ajuda a entender se a carta teve sorte ou se
    // ganhou pelos atributos — que é justamente o que o treino serve para
    // descobrir.
    const log = resultado.rounds.flatMap((r) => r.log).join('\n');
    const criticos = (log.match(/CRÍTICO/g) || []).length;
    const viradas = (log.match(/VIRADA/g) || []).length;

    if (criticos > 0 || viradas > 0) {
        embed.addFields({
            name: 'Da luta',
            value: `💥 ${criticos} crítico(s) • 🔥 ${viradas} virada(s)`,
            inline: false
        });
    }

    embed.setFooter({
        text: `${ui.BRAND} • Treino não vale moeda, ELO nem conquista`
    });

    return embed;
}

function botoes(dificuldade) {
    return [new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`treino_${dificuldade}`)
            .setLabel('Lutar de novo')
            .setEmoji('🔁')
            .setStyle(ButtonStyle.Secondary)
    )];
}

async function treinoRun(client, interaction) {
    const dificuldade = interaction.options?.getString?.('dificuldade') || treino.PADRAO;
    return executarTreino(interaction, dificuldade);
}

/**
 * Compartilhado entre o comando e o botão "Lutar de novo".
 * @param {boolean} vindoDeBotao muda como respondemos à interação
 */
async function executarTreino(interaction, dificuldade, vindoDeBotao = false) {
    const agora = Date.now();
    const ultimo = ultimoTreino.get(interaction.user.id) || 0;
    if (agora - ultimo < COOLDOWN_MS) {
        const faltam = Math.ceil((COOLDOWN_MS - (agora - ultimo)) / 1000);
        const aviso = { embeds: [ui.warning('Calma lá', `Espere ${faltam}s para treinar de novo.`)], flags: MessageFlags.Ephemeral };
        return vindoDeBotao ? interaction.reply(aviso) : interaction.reply(aviso);
    }
    ultimoTreino.set(interaction.user.id, agora);

    if (vindoDeBotao) await interaction.deferUpdate().catch(() => {});
    else await interaction.deferReply();

    const doc = await User.findOne({ id: interaction.user.id }).select('inventory').lean();
    const inventario = doc?.inventory || [];

    if (inventario.length < 3) {
        const erro = ui.error(
            'Time incompleto',
            `Você precisa de pelo menos **3 cartas** para treinar. Tem ${inventario.length}.\n\nUse \`/roll\` para conseguir mais.`
        );
        return vindoDeBotao
            ? interaction.followUp({ embeds: [erro], flags: MessageFlags.Ephemeral }).catch(() => {})
            : interaction.editReply({ embeds: [erro] });
    }

    const montagem = await treino.montarTimeRival(inventario, dificuldade);
    if (!montagem.ok) {
        const erro = ui.error('Catálogo vazio', 'Não há cartas cadastradas para o BOT Caviar usar.');
        return vindoDeBotao
            ? interaction.followUp({ embeds: [erro], flags: MessageFlags.Ephemeral }).catch(() => {})
            : interaction.editReply({ embeds: [erro] });
    }

    // A luta inteira é resolvida aqui, antes de qualquer animação — mesmo
    // princípio da batalha de verdade.
    const resultado = runBattle(montagem.meuTime, montagem.timeRival);
    const nomeJogador = interaction.user.username;

    const preparacao = ui.base(ui.STATUS_COLORS.warning)
        .setTitle('🥊 Treino')
        .setDescription(
            `**${nomeJogador}** contra **${treino.NOME_RIVAL}**\n`
            + `${montagem.dificuldade.emoji} ${montagem.dificuldade.nome}\n\n`
            + montagem.meuTime.map((c, i) =>
                `${ui.getRarity(c.rarity).emoji} **${ui.cardName(c.name)}** (${c.overall})`
                + `  ⚔️  ${ui.getRarity(montagem.timeRival[i].rarity).emoji} **${ui.cardName(montagem.timeRival[i].name)}** (${montagem.timeRival[i].overall})`
            ).join('\n')
        )
        .setFooter({ text: `${ui.BRAND} • Nada aqui conta para o seu progresso` });

    const mensagem = vindoDeBotao
        ? await interaction.editReply({ embeds: [preparacao], components: [] })
        : await interaction.editReply({ embeds: [preparacao] });

    // Reusa a mesma transmissão da batalha de verdade.
    try {
        await transmissao.transmitirEmMensagem({
            mensagem,
            nomeX: nomeJogador,
            nomeY: treino.NOME_RIVAL,
            resultado,
            wager: 0
        });
    } catch (err) {
        console.error('Erro na transmissão do treino:', err.message);
    }

    return interaction.editReply({
        embeds: [embedResultado(resultado, nomeJogador, montagem.dificuldade)],
        components: botoes(dificuldade)
    }).catch(() => {});
}

module.exports = treinoRun;
module.exports.executarTreino = executarTreino;
module.exports.COOLDOWN_MS = COOLDOWN_MS;
