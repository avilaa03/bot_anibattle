const User = require('./userSchema');
const ui = require('./embeds');
const { MessageFlags } = require('discord.js');

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
function embedBanimento(banimento) {
    const prazo = banimento.expiraEm
        ? `Termina <t:${Math.floor(new Date(banimento.expiraEm).getTime() / 1000)}:R>, em <t:${Math.floor(new Date(banimento.expiraEm).getTime() / 1000)}:f>.`
        : 'Suspensão **permanente**.';

    return ui.error('Conta suspensa', 'Sua conta está impedida de usar o AniBattle.')
        .addFields(
            { name: 'Motivo', value: banimento.motivo || 'Não informado.', inline: false },
            { name: 'Prazo', value: prazo, inline: false }
        )
        .setFooter({ text: `${ui.BRAND} • Se você acha que foi engano, fale no servidor de suporte` });
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
        await interaction.reply({
            embeds: [embedBanimento(banimento)],
            flags: MessageFlags.Ephemeral
        }).catch(() => {});
    }
    return true;
}

module.exports = { consultarBanimento, bloquearSeBanido, embedBanimento, limparCache, CACHE_MS };
