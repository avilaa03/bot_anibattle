const ui = require('./embeds');
const { montarRoteiro } = require('./narracao');

/**
 * Transmite uma batalha ao vivo, editando uma mensagem no canal.
 *
 * ## Contrato deste arquivo
 *
 * Ele recebe uma batalha JÁ RESOLVIDA e apenas reencena. Não calcula
 * resultado, não mexe em saldo, não grava nada no banco. Se algo aqui
 * falhar, o jogo não é afetado — só a animação.
 *
 * Isso é proposital e é o ponto mais importante do desenho: a fonte da
 * verdade é o resultado gravado antes da transmissão começar. Queda do
 * bot no meio da luta não deixa aposta presa nem partida sem vencedor.
 *
 * ## Só no servidor
 *
 * A transmissão acontece no canal onde o desafio foi feito, para os dois
 * acompanharem juntos e o resto do servidor torcer. A escolha do time
 * continua no privado (senão o oponente veria seu time antes de montar o
 * dele), mas a luta é pública.
 */

/** Se a transmissão passar disso, desiste e mostra o resultado direto. */
const LIMITE_TOTAL_MS = 60 * 1000;

const espera = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @param {object} opcoes
 * @param {object} opcoes.canal       canal do Discord onde transmitir
 * @param {string} opcoes.nomeX
 * @param {string} opcoes.nomeY
 * @param {string} opcoes.mencao      texto com as menções dos dois
 * @param {object} opcoes.resultado   retorno do runBattle
 * @param {number} opcoes.wager
 * @returns {Promise<object|null>} a mensagem usada, ou null se não deu
 */
async function transmitir({ canal, nomeX, nomeY, mencao, resultado, wager = 0 }) {
    if (!canal) return null;

    const roteiro = montarRoteiro({ nomeX, nomeY, resultado, wager });
    if (roteiro.quadros.length === 0) return null;

    let mensagem;
    try {
        mensagem = await canal.send({ content: mencao, embeds: [roteiro.quadros[0]] });
    } catch {
        // Sem permissão de enviar no canal: a batalha segue, sem animação.
        return null;
    }

    await reproduzir(mensagem, roteiro, 1);
    return mensagem;
}

/**
 * Transmite editando uma mensagem que já existe.
 *
 * É o que o `/treino` usa: lá a resposta do comando já está na tela e não
 * faz sentido mandar uma segunda mensagem só para animar.
 */
async function transmitirEmMensagem({ mensagem, nomeX, nomeY, resultado, wager = 0 }) {
    if (!mensagem) return null;

    const roteiro = montarRoteiro({ nomeX, nomeY, resultado, wager });
    if (roteiro.quadros.length === 0) return null;

    // Começa do zero: a mensagem hoje mostra a tela de preparação.
    await reproduzir(mensagem, roteiro, 0);
    return mensagem;
}

/** Percorre os quadros editando a mensagem, respeitando o teto de tempo. */
async function reproduzir(mensagem, roteiro, aPartirDe) {
    const comecou = Date.now();

    for (let i = aPartirDe; i < roteiro.quadros.length; i++) {
        // Teto de tempo absoluto. Sem isso, uma luta longa somada a
        // lentidão da API poderia deixar os jogadores minutos esperando.
        if (Date.now() - comecou > LIMITE_TOTAL_MS) break;

        // O primeiro quadro do modo "mensagem existente" aparece logo, sem
        // espera: a tela de preparação já cumpriu o papel de pausa.
        if (i > aPartirDe || aPartirDe > 0) await espera(roteiro.intervaloMs);

        try {
            await mensagem.edit({ embeds: [roteiro.quadros[i]] });
        } catch {
            // Rate limit ou mensagem apagada: interrompe a animação. O
            // resultado final é enviado logo depois, de qualquer forma.
            break;
        }
    }
}

/**
 * Aviso de que a luta vai começar, para dar um respiro antes do primeiro
 * golpe e deixar os dois abrirem o canal.
 */
async function anunciarInicio(canal, nomeX, nomeY, mencao, wager = 0) {
    if (!canal) return null;

    const embed = ui.base(ui.STATUS_COLORS.warning)
        .setTitle('⚔️ Os times estão prontos!')
        .setDescription(`**${nomeX}** contra **${nomeY}**\n\nA luta começa em instantes...`)
        .setFooter({
            text: wager > 0
                ? `${ui.BRAND} • Valendo ${wager * 2} moedas`
                : `${ui.BRAND} • Duelo amistoso`
        });

    return canal.send({ content: mencao, embeds: [embed] }).catch(() => null);
}

module.exports = { transmitir, transmitirEmMensagem, anunciarInicio, LIMITE_TOTAL_MS };
