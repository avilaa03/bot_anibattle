/**
 * Motor de combate 1v1 usando ATA (velocidade), LIF (vida) e POW (dano).
 * Quem tem mais ATA ataca primeiro no turno; em caso de empate, ataque simultâneo.
 */

function runRound(cardA, cardB, roundIndex) {
    let lifeA = cardA.LIF;
    let lifeB = cardB.LIF;
    const log = [];

    while (lifeA > 0 && lifeB > 0) {
        const ataA = cardA.ATA ?? 0;
        const ataB = cardB.ATA ?? 0;
        const powA = cardA.POW ?? 0;
        const powB = cardB.POW ?? 0;

        if (ataA > ataB) {
            lifeB -= powA;
            log.push(`${cardA.name} ataca primeiro! ${cardB.name} sofre ${powA} de dano.`);
            if (lifeB <= 0) {
                log.push(`${cardB.name} foi derrotado!`);
                return { winner: 'A', loser: 'B', log };
            }
            lifeA -= powB;
            log.push(`${cardB.name} contra-ataca! ${cardA.name} sofre ${powB} de dano.`);
            if (lifeA <= 0) {
                log.push(`${cardA.name} foi derrotado!`);
                return { winner: 'B', loser: 'A', log };
            }
        } else if (ataB > ataA) {
            lifeA -= powB;
            log.push(`${cardB.name} ataca primeiro! ${cardA.name} sofre ${powB} de dano.`);
            if (lifeA <= 0) {
                log.push(`${cardA.name} foi derrotado!`);
                return { winner: 'B', loser: 'A', log };
            }
            lifeB -= powA;
            log.push(`${cardA.name} contra-ataca! ${cardB.name} sofre ${powA} de dano.`);
            if (lifeB <= 0) {
                log.push(`${cardB.name} foi derrotado!`);
                return { winner: 'A', loser: 'B', log };
            }
        } else {
            lifeA -= powB;
            lifeB -= powA;
            log.push(`Ataque simultâneo! ${cardA.name} sofre ${powB}, ${cardB.name} sofre ${powA}.`);
            if (lifeA <= 0 && lifeB <= 0) {
                log.push(`Empate na rodada! Vitória para quem tem mais POW.`);
                return { winner: (cardA.POW >= cardB.POW ? 'A' : 'B'), loser: (cardA.POW >= cardB.POW ? 'B' : 'A'), log };
            }
            if (lifeA <= 0) {
                log.push(`${cardA.name} foi derrotado!`);
                return { winner: 'B', loser: 'A', log };
            }
            if (lifeB <= 0) {
                log.push(`${cardB.name} foi derrotado!`);
                return { winner: 'A', loser: 'B', log };
            }
        }
    }

    if (lifeA <= 0) return { winner: 'B', loser: 'A', log };
    return { winner: 'A', loser: 'B', log };
}

/**
 * Batalha 3v3: três rodadas, cada rodada é um 1v1. Quem ganhar mais rodadas vence.
 */
function runBattle(deckX, deckY) {
    const rounds = [];
    let winsX = 0;
    let winsY = 0;

    for (let i = 0; i < 3; i++) {
        const result = runRound(deckX[i], deckY[i], i);
        rounds.push({
            round: i + 1,
            cardX: deckX[i].name,
            cardY: deckY[i].name,
            winner: result.winner,
            log: result.log
        });
        if (result.winner === 'A') winsX++;
        else winsY++;
    }

    const winner = winsX > winsY ? 'X' : winsX < winsY ? 'Y' : null;
    return {
        winner,
        winsX,
        winsY,
        rounds
    };
}

module.exports = { runRound, runBattle };
