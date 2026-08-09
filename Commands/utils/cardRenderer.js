const { AttachmentBuilder } = require('discord.js');
const CardBuilder = require('./cardBuilder');
const { buildAnimatedCard, ehAnimada } = require('./cardAnimator');

/**
 * Ponto único de renderização de carta.
 *
 * Decide sozinho entre PNG estático e GIF animado conforme a moldura
 * equipada, e devolve tudo pronto para anexar no embed. Os comandos não
 * precisam saber se a carta é animada ou não — por isso o nome do arquivo
 * vem junto no retorno.
 */

// Se a geração do GIF passar disso, cai para PNG. Melhor uma carta
// estática rápida do que o Discord estourar o tempo da interação.
const TIMEOUT_GIF_MS = Number(process.env.CARD_GIF_TIMEOUT_MS) > 0
    ? Number(process.env.CARD_GIF_TIMEOUT_MS)
    : 8000;

// Avisa uma vez só, em vez de poluir o log a cada carta.
let avisouEncoderAusente = false;

function comTimeout(promessa, ms) {
    return Promise.race([
        promessa,
        new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT_GIF')), ms))
    ]);
}

/**
 * @param {object} cardData dados da carta
 * @param {object} [opcoes]
 * @param {string} [opcoes.moldura] moldura cosmética equipada
 * @param {string} [opcoes.locale] idioma dos rótulos desenhados na carta
 * @returns {Promise<{attachment: AttachmentBuilder, filename: string, url: string, animated: boolean}>}
 */
async function renderCard(cardData, opcoes = {}) {
    const moldura = opcoes.moldura || 'nenhuma';
    const locale = opcoes.locale;

    if (ehAnimada(moldura)) {
        try {
            const buffer = await comTimeout(buildAnimatedCard(cardData, moldura, locale), TIMEOUT_GIF_MS);
            const filename = 'cardImage.gif';
            return {
                attachment: new AttachmentBuilder(buffer, { name: filename }),
                filename,
                url: `attachment://${filename}`,
                animated: true
            };
        } catch (err) {
            // Fallback silencioso para PNG: o jogador ainda vê a carta,
            // só que sem animação. Nunca deixamos o comando falhar por
            // causa de um efeito cosmético.
            if (err.code === 'MODULE_NOT_FOUND') {
                if (!avisouEncoderAusente) {
                    console.warn('[cardRenderer] gif-encoder-2 não instalado — molduras animadas cairão para PNG. Rode: npm install gif-encoder-2');
                    avisouEncoderAusente = true;
                }
            } else {
                console.error('[cardRenderer] falha ao gerar GIF, usando PNG:', err.message);
            }
        }
    }

    const builder = new CardBuilder(cardData, { moldura, locale });
    const buffer = await builder.build();
    const filename = 'cardImage.png';
    return {
        attachment: new AttachmentBuilder(buffer, { name: filename }),
        filename,
        url: `attachment://${filename}`,
        animated: false
    };
}

module.exports = { renderCard };
