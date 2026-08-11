const ui = require('./embeds');
const narracao = require('./narracao');

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
 * @param {string} [dados.titulo] título próprio; na falta, o do dicionário
 * @param {function} dados.t      tradutor do idioma de quem vai ler
 */
function montarEmbedResultado({ nomeX, nomeY, resultado, cor = COR_VITORIA, titulo, t }) {
    const venceuX = resultado.winner === 'X';
    const nomeVencedor = venceuX ? nomeX : nomeY;
    const placar = `**${resultado.winsX}** — **${resultado.winsY}**`;

    const embed = ui.base(cor)
        .setTitle(titulo ?? t('battle.fim_titulo'))
        .setDescription(t('battle.fim_texto', {
            vencedor: nomeVencedor,
            x: nomeX,
            placar,
            y: nomeY
        }));

    const roundLines = resultado.rounds.map((r) => {
        const ganhouX = r.winner === 'A';
        const quemVenceu = ganhouX ? nomeX : nomeY;

        // O destaque sai das FLAGS do evento, não de procurar "CRÍTICO"
        // dentro da frase. A varredura de texto funcionava só enquanto a
        // narração era em português: traduzida, ela não acharia nada e a
        // linha de destaque sumiria da tela sem erro nenhum.
        const marcantes = (r.eventos || []).filter(
            (e) => e.tipo === 'esquiva' || (e.tipo === 'golpe' && (e.crit || e.desperate))
        );
        const ultimo = marcantes[marcantes.length - 1];
        const extra = ultimo ? `\n└ ${narracao.descreverEvento(ultimo, t)}` : '';

        return `\`R${r.round}\` ${ganhouX ? '🟢' : '🔴'} **${ui.cardName(r.cardX, r.nivelX)}** vs **${ui.cardName(r.cardY, r.nivelY)}** → ${quemVenceu}${extra}`;
    }).join('\n');

    embed.addFields({
        name: t('battle.rodadas'),
        value: roundLines.slice(0, 1024),
        inline: false
    });

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
    // Conta pelos EVENTOS, não varrendo o texto da narração.
    //
    // Isto era `log.match(/CRÍTICO/g)`: uma expressão regular procurando a
    // palavra dentro da frase mostrada na tela. Funcionava, mas amarrava a
    // progressão do jogador ao texto — traduzir a narração, ou só trocar
    // "CRÍTICO" por "Crítico", zeraria em silêncio o troféu "Golpe
    // certeiro" e a missão "Precisão". Sem erro e sem log: só jogador
    // reclamando que não desbloqueia.
    //
    // Os eventos já carregam `crit` e `desperate` como booleano desde que
    // a transmissão ao vivo passou a existir.
    let criticos = 0;
    let viradas = 0;

    for (const rodada of resultado.rounds) {
        for (const evento of rodada.eventos || []) {
            if (evento.tipo !== 'golpe') continue;

            // O `!evento.desperate` reproduz de propósito o que a regex
            // fazia, e vale explicar porque parece errado à primeira vista.
            //
            // `desperate` só é verdadeiro quando `crit` também é — ou seja,
            // TODA virada é, mecanicamente, um crítico. Mas `descreverGolpe`
            // usa `if/else if` e escreve só "VIRADA!" nesses casos, então a
            // varredura de texto nunca enxergava esses críticos.
            //
            // Contá-los agora deixaria a conta mais correta, mas aceleraria
            // o troféu "Golpe certeiro" e a missão "Precisão" para todo
            // mundo. Mudar taxa de desbloqueio é decisão de jogo, não efeito
            // colateral de uma limpeza — então fica como está, e a diferença
            // está registrada aqui para ser decidida à parte.
            if (evento.crit && !evento.desperate) criticos++;
            if (evento.desperate) viradas++;
        }
    }

    return { criticos, viradas };
}

module.exports = { COR_VITORIA, montarEmbedResultado, contarDestaques };
