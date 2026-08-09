const User = require('./userSchema');
const ui = require('./embeds');
const { MessageFlags } = require('discord.js');
const { criarT, DEFAULT_LOCALE } = require('./i18n');
const { resolverIdioma } = require('./idioma');

/**
 * Banimento de jogadores.
 *
 * Um jogador banido não consegue usar NENHUM comando nem clicar em botão
 * do bot. Ele recebe um aviso dizendo o motivo e até quando — a punição é
 * aberta de propósito: banimento silencioso gera ticket de suporte
 * insolúvel ("não sei o que fiz de errado") e deixa você sem defesa se o
 * banimento foi engano seu.
 *
 * O banimento é aplicado pelo painel administrativo do site, que escreve
 * direto em `users.banimento`. Este arquivo é só o lado da leitura.
 *
 * ## Por que tem cache
 *
 * A verificação roda em toda interação, antes de qualquer comando. Sem
 * cache seria uma consulta ao Mongo a mais por clique, para um campo que
 * quase nunca muda. O cache guarda o veredito por 30 segundos, o que
 * significa que um banimento aplicado no site leva no máximo meio minuto
 * para valer — trade-off consciente, e o site avisa isso na tela.
 */

const CACHE_MS = 30 * 1000;
const cache = new Map();

/** Descarta o cache de um usuário (ou de todos). */
function limparCache(userId = null) {
    if (userId) cache.delete(userId);
    else cache.clear();
}

/**
 * Consulta o banimento de um usuário.
 *
 * Devolve `null` se ele pode jogar, ou o objeto do banimento se está
 * suspenso. Banimento com prazo vencido é apagado do banco na hora em que
 * é encontrado, então ele se auto-resolve sem precisar de rotina agendada.
 *
 * @returns {Promise<null | { motivo: string|null, expiraEm: Date|null }>}
 */
async function consultarBanimento(userId) {
    if (!userId) return null;

    const guardado = cache.get(userId);
    if (guardado && guardado.ate > Date.now()) return guardado.valor;

    let banimento = null;
    try {
        const doc = await User.findOne({ id: userId }).select('banimento').lean();
        const b = doc?.banimento;

        if (b?.ativo) {
            const vencido = b.expiraEm && new Date(b.expiraEm).getTime() <= Date.now();
            if (vencido) {
                // Cumpriu a pena: libera sozinho.
                await User.updateOne(
                    { id: userId },
                    { $set: { 'banimento.ativo': false } }
                ).catch(() => {});
            } else {
                banimento = { motivo: b.motivo || null, expiraEm: b.expiraEm || null };
            }
        }
    } catch {
        // Banco fora do ar não pode virar "todo mundo banido". Em caso de
        // falha, deixamos passar — errar liberando é menos grave aqui.
        return null;
    }

    cache.set(userId, { valor: banimento, ate: Date.now() + CACHE_MS });
    return banimento;
}

/** Embed mostrado ao jogador suspenso. */
function embedBanimento(banimento, locale = DEFAULT_LOCALE) {
    const t = criarT(locale);

    // O motivo é escrito por um administrador no painel do site, então é
    // texto livre — sai como veio, sem tradução. Traduzir só a moldura da
    // mensagem é o certo aqui: inventar uma tradução do motivo seria pior
    // que mostrá-lo no idioma original.
    const segundos = banimento.expiraEm
        ? Math.floor(new Date(banimento.expiraEm).getTime() / 1000)
        : null;

    const prazo = segundos
        ? t('moderacao.prazo_ate', { relativo: segundos, absoluto: segundos })
        : t('moderacao.prazo_permanente');

    return ui.error(t('moderacao.titulo'), t('moderacao.descricao'))
        .addFields(
            { name: t('moderacao.motivo'), value: banimento.motivo || t('moderacao.motivo_nao_informado'), inline: false },
            { name: t('moderacao.prazo'), value: prazo, inline: false }
        )
        .setFooter({ text: `${ui.BRAND} • ${t('moderacao.rodape')}` });
}

/**
 * Para usar no topo do `interactionCreate`.
 *
 * @returns {Promise<boolean>} true se bloqueou (o chamador deve parar ali)
 */
async function bloquearSeBanido(interaction) {
    const banimento = await consultarBanimento(interaction.user?.id);
    if (!banimento) return false;

    if (interaction.isRepliable()) {
        const locale = await resolverIdioma(interaction);
        await interaction.reply({
            embeds: [embedBanimento(banimento, locale)],
            flags: MessageFlags.Ephemeral
        }).catch(() => {});
    }
    return true;
}

module.exports = { consultarBanimento, bloquearSeBanido, embedBanimento, limparCache, CACHE_MS };
