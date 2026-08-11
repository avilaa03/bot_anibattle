const { AttachmentBuilder, MessageFlags } = require('discord.js');
const ui = require('./embeds');
const achievements = require('./achievements');
const progressaoDeNivel = require('./levelProgression');
const { criarT, DEFAULT_LOCALE } = require('./i18n');
const { resolverIdioma } = require('./language');

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
function imagemTrofeu(conquista, locale = DEFAULT_LOCALE) {
    try {
        const { buildTrophy } = require('./trophyBuilder');
        const tipo = achievements.TIPOS[conquista.tipo];
        const buffer = buildTrophy(achievements.localizar(conquista, locale), tipo, locale);
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
function embedConquista(conquista, comImagem = false, locale = DEFAULT_LOCALE) {
    const t = criarT(locale);
    const traduzida = achievements.localizar(conquista, locale);
    const tipo = achievements.TIPOS[conquista.tipo];
    const embed = ui.base(tipo.cor)
        .setAuthor({ name: t('notificacoes.trofeu_desbloqueado') })
        .setTitle(`${tipo.emoji} ${traduzida.nome}`)
        .setDescription(`*${traduzida.descricao}*`)
        .setFooter({ text: `${ui.BRAND} • ${t('notificacoes.trofeu_rodape', { tipo: achievements.nomeTipo(conquista.tipo, locale), pontos: tipo.pontos })}` });

    if (comImagem) embed.setImage('attachment://trofeu.png');
    return embed;
}

/** Anúncio de troféu raro, para o canal. */
function embedAnuncio(conquista, userId, locale = DEFAULT_LOCALE) {
    const t = criarT(locale);
    const tipo = achievements.TIPOS[conquista.tipo];
    const traduzida = achievements.localizar(conquista, locale);
    const ehPlatina = conquista.tipo === 'platina';

    const embed = ui.base(tipo.cor)
        .setTitle(ehPlatina ? t('notificacoes.platina_titulo') : t('notificacoes.ouro_titulo', { emoji: tipo.emoji }))
        .setDescription(t(
            ehPlatina ? 'notificacoes.platina_descricao' : 'notificacoes.ouro_descricao',
            { userId, nome: traduzida.nome, descricao: traduzida.descricao }
        ))
        .setImage('attachment://trofeu.png')
        .setFooter({ text: `${ui.BRAND} • ${t('notificacoes.anuncio_rodape')}` });

    return embed;
}

function embedMissoes(missoesCompletas, locale = DEFAULT_LOCALE) {
    const t = criarT(locale);
    const missoes = require('./missions');

    const linhas = missoesCompletas.map((m) => {
        const def = missoes.localizar(m, locale);
        return t('notificacoes.missao_linha', {
            nome: def.nome,
            descricao: def.descricao,
            recompensa: ui.coins(m.recompensa, locale)
        });
    }).join('\n');

    const total = missoesCompletas.reduce((s, m) => s + m.recompensa, 0);

    return ui.success(t('notificacoes.missao_completa'), linhas)
        .addFields({
            name: t('notificacoes.missao_para_receber'),
            value: t('notificacoes.missao_resgate', { total: ui.coins(total, locale) }),
            inline: false
        });
}

/**
 * Envia os avisos de uma interação.
 *
 * Raros vão para o canal (todo mundo vê); comuns e missões vão privado.
 */
/**
 * Aviso de subida de nível.
 *
 * Vai no PRIVADO junto das missões, não no canal. Subir de nível acontece
 * com frequência — anunciar cada um publicamente viraria ruído, e o que
 * merece o canal são os troféus de ouro e platina, que são raros.
 */
function embedNivel(progressaoNivel, locale = DEFAULT_LOCALE) {
    const t = criarT(locale);
    const { nivelDepois, entregues } = progressaoNivel;

    const embed = ui.base(0xFFD700)
        .setTitle(t('nivel.subiu_titulo', { nivel: nivelDepois }))
        .setDescription(
            entregues.length > 1
                ? t('nivel.subiu_varios', { n: entregues.length })
                : t('nivel.subiu_um')
        );

    for (const { nivel: n, recompensa } of entregues.slice(0, 5)) {
        const linhas = progressaoDeNivel.descrever(recompensa);
        if (linhas.length > 0) {
            embed.addFields({ name: t('nivel.nivel_n', { n }), value: linhas.join('\n'), inline: false });
        }
    }

    embed.setFooter({ text: `${ui.BRAND} • ${t('nivel.rodape')}` });
    return embed;
}

async function notificarProgresso(interaction, resultado) {
    if (!resultado) return;
    const { conquistas = [], missoesCompletas = [], nivel: progressaoNivel = null } = resultado;

    const subiuDeNivel = Boolean(progressaoNivel?.subiu);
    if (conquistas.length === 0 && missoesCompletas.length === 0 && !subiuDeNivel) return;

    const locale = await resolverIdioma(interaction);

    const publicas = conquistas.filter(ehPublica);
    const privadas = conquistas.filter((c) => !ehPublica(c));

    // ---- Privado: bronze, prata e missões ----
    const embedsPrivados = [
        // O nível vem primeiro: é a recompensa maior, e o Discord mostra os
        // embeds na ordem em que chegam.
        ...(subiuDeNivel ? [embedNivel(progressaoNivel, locale)] : []),
        ...privadas.slice(0, 3).map((c) => embedConquista(c, false, locale)),
        ...(missoesCompletas.length > 0 ? [embedMissoes(missoesCompletas, locale)] : [])
    ];

    if (embedsPrivados.length > 0) {
        try {
            const payload = { embeds: embedsPrivados, flags: MessageFlags.Ephemeral };
            if (interaction.replied || interaction.deferred) await interaction.followUp(payload);
            else await interaction.reply(payload);
        } catch (err) { /* aviso nunca quebra o comando */ }
    }

    // ---- Público: ouro e platina, um de cada vez para cada um ter destaque ----
    const t = criarT(locale);
    for (const conquista of publicas.slice(0, 2)) {
        try {
            const anexo = imagemTrofeu(conquista, locale);
            await interaction.followUp({
                content: conquista.tipo === 'platina'
                    ? t('notificacoes.platinou', { userId: interaction.user.id })
                    : null,
                embeds: [anexo
                    ? embedAnuncio(conquista, interaction.user.id, locale)
                    : embedConquista(conquista, false, locale)],
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
 * @param {string} [locale] idioma do jogador que conquistou
 */
async function anunciarConquistas(client, userId, conquistas, canal = null, locale = DEFAULT_LOCALE) {
    if (!conquistas || conquistas.length === 0) return;

    const t = criarT(locale);
    const publicas = conquistas.filter(ehPublica);
    const privadas = conquistas.filter((c) => !ehPublica(c));

    const usuario = await client.users.fetch(userId).catch(() => null);

    if (privadas.length > 0 && usuario) {
        await usuario.send({
            embeds: privadas.slice(0, 3).map((c) => embedConquista(c, false, locale))
        }).catch(() => {});
    }

    for (const conquista of publicas.slice(0, 2)) {
        const anexo = imagemTrofeu(conquista, locale);
        const payload = {
            content: conquista.tipo === 'platina' ? t('notificacoes.platinou', { userId }) : null,
            embeds: [anexo
                ? embedAnuncio(conquista, userId, locale)
                : embedConquista(conquista, false, locale)],
            files: anexo ? [anexo] : []
        };

        // Canal quando houver; senão o privado do jogador não fica sem aviso.
        if (canal) await canal.send(payload).catch(() => {});
        else if (usuario) await usuario.send(payload).catch(() => {});
    }
}

module.exports = {
    notificarProgresso,
    embedNivel,
    anunciarConquistas,
    embedConquista,
    embedAnuncio,
    embedMissoes,
    imagemTrofeu,
    ehPublica,
    TIPOS_PUBLICOS
};
