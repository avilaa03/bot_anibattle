const ui = require('./embeds');

/**
 * Tela final de uma batalha 3v3.
 *
 * ## Por que é compartilhada com o treino
 *
 * O `/treino` é a MESMA batalha do `/battle` — mesmo motor, mesma
 * narração, mesmas regras. Só muda quem é o adversário e o fato de nada
 * ser cobrado nem registrado. Se a tela final fosse montada duas vezes,
 * as duas divergiriam na primeira mudança e o treino deixaria de servir
 * para prever como a batalha de verdade se comporta — que é o único
 * motivo dele existir.
 *
 * Aqui fica só o que é comum: placar, vencedor e o resumo das rodadas.
 * Aposta e ranking são acrescentados pelo `/battle`; o aviso de "não vale
 * nada" é acrescentado pelo `/treino`.
 *
 * Este módulo só desenha. Não lê banco, não decide vencedor.
 */

/** Ouro: a cor de "acabou e alguém ganhou". */
const COR_VITORIA = 0xFFD700;

/**
 * @param {object} dados
 * @param {string} dados.nomeX     lado X (quem chamou o comando)
 * @param {string} dados.nomeY     lado Y (oponente ou BOT)
 * @param {object} dados.resultado retorno do runBattle
 * @param {number} dados.cor
 * @param {string} dados.titulo
 */
function montarEmbedResultado({ nomeX, nomeY, resultado, cor = COR_VITORIA, titulo = '⚔️ Fim da batalha' }) {
    const venceuX = resultado.winner === 'X';
    const nomeVencedor = venceuX ? nomeX : nomeY;
    const placar = `**${resultado.winsX}** — **${resultado.winsY}**`;

    const embed = ui.base(cor)
        .setTitle(titulo)
        .setDescription(`👑 **${nomeVencedor}** venceu — ${nomeX} ${placar} ${nomeY}`);

    const roundLines = resultado.rounds.map((r) => {
        const ganhouX = r.winner === 'A';
        const quemVenceu = ganhouX ? nomeX : nomeY;
        const destaques = r.log.filter((l) => l.includes('CRÍTICO') || l.includes('VIRADA') || l.includes('esquivou'));
        const extra = destaques.length > 0 ? `\n└ ${destaques[destaques.length - 1]}` : '';
        return `\`R${r.round}\` ${ganhouX ? '🟢' : '🔴'} **${ui.cardName(r.cardX, r.nivelX)}** vs **${ui.cardName(r.cardY, r.nivelY)}** → ${quemVenceu}${extra}`;
    }).join('\n');

    embed.addFields({ name: 'Rodadas', value: roundLines.slice(0, 1024), inline: false });

    return embed;
}

/**
 * Conta os momentos marcantes da luta inteira.
 *
 * O `/battle` usa para missões e conquistas; o `/treino` usa só para
 * mostrar na tela — saber se a carta ganhou por sorte ou pelos atributos
 * é justamente o que o treino serve para descobrir.
 */
function contarDestaques(resultado) {
    const log = resultado.rounds.flatMap((r) => r.log).join('\n');
    return {
        criticos: (log.match(/CRÍTICO/g) || []).length,
        viradas: (log.match(/VIRADA/g) || []).length
    };
}

module.exports = { COR_VITORIA, montarEmbedResultado, contarDestaques };
