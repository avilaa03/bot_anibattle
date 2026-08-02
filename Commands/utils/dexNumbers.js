const Card = require('./cardSchema');

/**
 * Numeração da Pokédex.
 *
 * O número precisa ser FIXO: se hoje o Kirito é o #042, amanhã ele
 * continua sendo o #042, independentemente de quantas cartas entraram no
 * catálogo depois. Por isso o número é gravado na carta, e não calculado
 * pela posição numa lista — posição muda toda vez que o catálogo cresce
 * ou que alguém aplica um filtro.
 *
 * Cartas novas sempre recebem o próximo número livre (nunca reaproveitam
 * número de carta removida), do mesmo jeito que uma nova geração de
 * Pokémon é anexada ao final da dex em vez de embaralhar a numeração.
 */

const LOTE = 500;

/** Maior número já atribuído (0 se nenhum). */
async function maiorNumero() {
    const ultima = await Card.findOne({ numero: { $ne: null } })
        .sort({ numero: -1 })
        .select('numero')
        .lean();
    return ultima?.numero || 0;
}

/**
 * Dá número às cartas que ainda não têm.
 *
 * A ordem de atribuição é série → nome, o que agrupa cartas do mesmo anime
 * em faixas contíguas e deixa a dex organizada de ler. Cartas que já têm
 * número nunca são renumeradas.
 *
 * @returns {Promise<{atribuidos: number, primeiro: number|null, ultimo: number|null}>}
 */
async function assignMissingDexNumbers() {
    // `{ numero: null }` no Mongo casa tanto com null quanto com ausente.
    const semNumero = await Card.find({ numero: null })
        .sort({ series: 1, name: 1 })
        .select('_id')
        .lean();

    if (semNumero.length === 0) {
        return { atribuidos: 0, primeiro: null, ultimo: null };
    }

    let proximo = (await maiorNumero()) + 1;
    const primeiro = proximo;

    for (let i = 0; i < semNumero.length; i += LOTE) {
        const lote = semNumero.slice(i, i + LOTE);
        await Card.bulkWrite(
            lote.map((carta) => ({
                updateOne: {
                    filter: { _id: carta._id },
                    update: { $set: { numero: proximo++ } }
                }
            })),
            { ordered: true }
        );
    }

    return { atribuidos: semNumero.length, primeiro, ultimo: proximo - 1 };
}

/** Formata o número no padrão da dex: 42 -> "#042". */
function formatarNumero(numero, total = 0) {
    if (numero == null) return '#???';
    const casas = Math.max(3, String(total).length);
    return `#${String(numero).padStart(casas, '0')}`;
}

module.exports = { assignMissingDexNumbers, maiorNumero, formatarNumero };
