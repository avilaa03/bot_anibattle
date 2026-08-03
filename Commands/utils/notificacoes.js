const { AttachmentBuilder, MessageFlags } = require('discord.js');
const ui = require('./embeds');
const achievements = require('./achievements');

/**
 * Avisos de progresso.
 *
 * Conquista e missão acontecem no meio de outra ação (rolar, batalhar).
 * O aviso vem separado para não atrapalhar a resposta principal.
 *
 * A decisão de visibilidade é intencional:
 *
 *   🥉 Bronze e 🥈 Prata → **privado**. São frequentes; anunciar todas
 *      encheria o canal e tiraria o valor das raras.
 *   🥇 Ouro e 💎 Platina → **público**, com imagem. São raras e custam
 *      esforço — merecem ser vistas, e ver alguém platinar é o que dá
 *      vontade de perseguir os troféus.
 */

// Troféus que valem anúncio no canal.
const TIPOS_PUBLICOS = new Set(['ouro', 'platina']);

// Falhar em gerar a imagem nunca pode segurar o aviso.
let avisouCanvasIndisponivel = false;

function ehPublica(conquista) {
    return TIPOS_PUBLICOS.has(conquista.tipo);
}

/** Gera a imagem do troféu; devolve null se o canvas não estiver disponível. */
function imagemTrofeu(conquista) {
    try {
        const { buildTrophy } = require('./trophyBuilder');
        const tipo = achievements.TIPOS[conquista.tipo];
        const buffer = buildTrophy(conquista, tipo);
        return new AttachmentBuilder(buffer, { name: 'trofeu.png' });
    } catch (err) {
        if (!avisouCanvasIndisponivel) {
            console.warn('[notificacoes] não foi possível gerar a imagem do troféu:', err.message);
            avisouCanvasIndisponivel = true;
        }
        return null;
    }
}

/** Embed de troféu. `comImagem` usa o banner desenhado em canvas. */
function embedConquista(conquista, comImagem = false) {
    const tipo = achievements.TIPOS[conquista.tipo];
    const embed = ui.base(tipo.cor)
        .setAuthor({ name: 'Troféu desbloqueado!' })
        .setTitle(`${tipo.emoji} ${conquista.nome}`)
        .setDescription(`*${conquista.descricao}*`)
        .setFooter({ text: `${ui.BRAND} • Troféu de ${tipo.nome} • +${tipo.pontos} pontos` });

    if (comImagem) embed.setImage('attachment://trofeu.png');
    return embed;
}

/** Anúncio de troféu raro, para o canal. */
function embedAnuncio(conquista, userId) {
    const tipo = achievements.TIPOS[conquista.tipo];
    const ehPlatina = conquista.tipo === 'platina';

    const embed = ui.base(tipo.cor)
        .setTitle(ehPlatina ? '💎 PLATINA CONQUISTADA!' : `${tipo.emoji} Troféu de Ouro!`)
        .setDescription(
            ehPlatina
                ? `<@${userId}> conquistou **todos os troféus do AniBattle**.\n\n**${conquista.nome}** — *${conquista.descricao}*`
                : `<@${userId}> desbloqueou **${conquista.nome}**\n\n*${conquista.descricao}*`
        )
        .setImage('attachment://trofeu.png')
        .setFooter({ text: `${ui.BRAND} • Veja os seus em /conquistas` });

    return embed;
}

function embedMissoes(missoesCompletas) {
    const linhas = missoesCompletas.map(
        (m) => `✅ **${m.nome}** — ${m.descricao}\n└ Recompensa: ${ui.coins(m.recompensa)}`
    ).join('\n');

    const total = missoesCompletas.reduce((s, m) => s + m.recompensa, 0);

    return ui.success('Missão completa!', linhas)
        .addFields({
            name: 'Para receber',
            value: `Use \`/missoes\` e clique em **Resgatar** (${ui.coins(total)} disponíveis).`,
            inline: false
        });
}

/**
 * Envia os avisos de uma interação.
 *
 * Raros vão para o canal (todo mundo vê); comuns e missões vão privado.
 */
async function notificarProgresso(interaction, resultado) {
    if (!resultado) return;
    const { conquistas = [], missoesCompletas = [] } = resultado;
    if (conquistas.length === 0 && missoesCompletas.length === 0) return;

    const publicas = conquistas.filter(ehPublica);
    const privadas = conquistas.filter((c) => !ehPublica(c));

    // ---- Privado: bronze, prata e missões ----
    const embedsPrivados = [
        ...privadas.slice(0, 3).map((c) => embedConquista(c)),
        ...(missoesCompletas.length > 0 ? [embedMissoes(missoesCompletas)] : [])
    ];

    if (embedsPrivados.length > 0) {
        try {
            const payload = { embeds: embedsPrivados, flags: MessageFlags.Ephemeral };
            if (interaction.replied || interaction.deferred) await interaction.followUp(payload);
            else await interaction.reply(payload);
        } catch (err) { /* aviso nunca quebra o comando */ }
    }

    // ---- Público: ouro e platina, um de cada vez para cada um ter destaque ----
    for (const conquista of publicas.slice(0, 2)) {
        try {
            const anexo = imagemTrofeu(conquista);
            await interaction.followUp({
                content: conquista.tipo === 'platina' ? `🎉 <@${interaction.user.id}> PLATINOU O ANIBATTLE! 🎉` : null,
                embeds: [anexo ? embedAnuncio(conquista, interaction.user.id) : embedConquista(conquista)],
                files: anexo ? [anexo] : []
            });
        } catch (err) { /* idem */ }
    }
}

/**
 * Versão para quando não há interação disponível (batalha resolvida,
 * torneio, troca). Manda o raro no canal e o comum no privado.
 *
 * @param {import('discord.js').Client} client
 * @param {string} userId
 * @param {Array} conquistas
 * @param {import('discord.js').TextBasedChannel|null} canal
 */
async function anunciarConquistas(client, userId, conquistas, canal = null) {
    if (!conquistas || conquistas.length === 0) return;

    const publicas = conquistas.filter(ehPublica);
    const privadas = conquistas.filter((c) => !ehPublica(c));

    const usuario = await client.users.fetch(userId).catch(() => null);

    if (privadas.length > 0 && usuario) {
        await usuario.send({
            embeds: privadas.slice(0, 3).map((c) => embedConquista(c))
        }).catch(() => {});
    }

    for (const conquista of publicas.slice(0, 2)) {
        const anexo = imagemTrofeu(conquista);
        const payload = {
            content: conquista.tipo === 'platina' ? `🎉 <@${userId}> PLATINOU O ANIBATTLE! 🎉` : null,
            embeds: [anexo ? embedAnuncio(conquista, userId) : embedConquista(conquista)],
            files: anexo ? [anexo] : []
        };

        // Canal quando houver; senão o privado do jogador não fica sem aviso.
        if (canal) await canal.send(payload).catch(() => {});
        else if (usuario) await usuario.send(payload).catch(() => {});
    }
}

module.exports = {
    notificarProgresso,
    anunciarConquistas,
    embedConquista,
    embedAnuncio,
    embedMissoes,
    imagemTrofeu,
    ehPublica,
    TIPOS_PUBLICOS
};
