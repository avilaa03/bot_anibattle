const { MessageFlags, PermissionFlagsBits } = require('discord.js');
const ui = require('../../utils/embeds');
const User = require('../../utils/userSchema');
const Guild = require('../../utils/guildSchema');
const { criarT, normalizar, LOCALES } = require('../../utils/i18n');
const idiomaUtil = require('../../utils/idioma');

/**
 * /idioma — escolhe em que idioma o bot responde.
 *
 * Dois escopos:
 *
 *   mim       → só para quem rodou o comando. Vale em qualquer servidor
 *               e vence a configuração do servidor.
 *   servidor  → padrão de quem não escolheu nada. Exige "Gerenciar
 *               servidor", porque muda a experiência de todo mundo.
 *
 * Escolher "automático" apaga a preferência em vez de gravar um idioma.
 * É o que devolve o comportamento de fábrica: seguir o servidor e, na
 * falta dele, o idioma do próprio cliente Discord do jogador.
 */

/**
 * O nome de cada idioma, nele mesmo — não traduzido.
 *
 * Quem procura espanhol procura "Español", esteja o bot no idioma que
 * estiver. Traduzir ("Espanhol" / "Spanish" / "Español") faria a mesma
 * opção mudar de nome conforme o idioma atual, que é exatamente o que
 * atrapalha quem está tentando SAIR de um idioma que não entende.
 */
const NOMES = {
    'pt-BR': '🇧🇷 Português (Brasil)',
    'en-US': '🇺🇸 English (US)',
    'es-ES': '🇪🇸 Español'
};

/** Rótulo de um valor guardado, incluindo o caso "não escolhido". */
function rotulo(valor, t) {
    if (!valor) return t('idioma.automatico');
    return NOMES[normalizar(valor)] || valor;
}

module.exports = async (client, interaction) => {
    // Responde no idioma que valia ANTES da mudança. Confirmar em
    // português uma troca para inglês seria estranho, mas confirmar em
    // inglês uma troca que o jogador ainda não entendeu seria pior — e
    // logo abaixo trocamos o `t` quando a mudança é para o próprio
    // jogador, para ele já ver o resultado.
    let t = criarT(await idiomaUtil.resolverIdioma(interaction));

    const escolhido = interaction.options.getString('language');
    const escopo = interaction.options.getString('scope') || 'me';

    // ---------- Sem argumentos: só mostra a situação atual ----------
    if (!escolhido) {
        const [doUsuario, doServidor] = await Promise.all([
            idiomaUtil.idiomaDoUsuario(interaction.user.id),
            idiomaUtil.idiomaDoServidor(interaction.guildId)
        ]);

        const embed = ui.info(t('idioma.titulo_status'), t('idioma.descricao_status'))
            .addFields(
                { name: t('idioma.campo_voce'), value: rotulo(doUsuario, t), inline: true },
                {
                    name: t('idioma.campo_servidor'),
                    value: interaction.guildId ? rotulo(doServidor, t) : t('idioma.em_dm'),
                    inline: true
                },
                { name: t('idioma.campo_efetivo'), value: NOMES[t.locale] || t.locale, inline: true }
            )
            .setFooter({ text: `${ui.BRAND} • ${t('idioma.rodape_ajuda')}` });

        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    // 'auto' é a única opção que não é um locale — significa apagar.
    const novoValor = escolhido === 'auto' ? null : normalizar(escolhido);
    if (novoValor && !LOCALES.includes(novoValor)) {
        return interaction.reply({
            embeds: [ui.error(t('comum.erro'), t('idioma.nao_suportado'))],
            flags: MessageFlags.Ephemeral
        });
    }

    // ---------- Escopo: servidor ----------
    if (escopo === 'server') {
        if (!interaction.guildId) {
            return interaction.reply({
                embeds: [ui.error(t('comum.erro'), t('idioma.servidor_em_dm'))],
                flags: MessageFlags.Ephemeral
            });
        }

        // `interaction.memberPermissions` já vem resolvido pelo Discord —
        // não precisa buscar o membro nem os cargos.
        const podeGerenciar = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
        if (!podeGerenciar) {
            return interaction.reply({
                embeds: [ui.error(t('comum.sem_permissao'), t('idioma.precisa_gerenciar'))],
                flags: MessageFlags.Ephemeral
            });
        }

        await Guild.updateOne(
            { guildId: interaction.guildId },
            {
                $set: {
                    idioma: novoValor,
                    idiomaDefinidoPor: interaction.user.id,
                    idiomaDefinidoEm: new Date()
                }
            },
            { upsert: true }
        );
        idiomaUtil.invalidarServidor(interaction.guildId);

        // A resposta sai já no idioma novo do servidor, a não ser que
        // quem rodou tenha preferência própria (que continua valendo
        // para ele).
        const doUsuario = await idiomaUtil.idiomaDoUsuario(interaction.user.id);
        if (!doUsuario) t = criarT(await idiomaUtil.resolverIdioma(interaction));

        const embed = ui.success(
            t('idioma.servidor_alterado_titulo'),
            novoValor
                ? t('idioma.servidor_alterado', { idioma: NOMES[novoValor] })
                : t('idioma.servidor_automatico')
        ).setFooter({ text: `${ui.BRAND} • ${t('idioma.rodape_individual')}` });

        return interaction.reply({ embeds: [embed] });
    }

    // ---------- Escopo: só para mim ----------
    await User.updateOne(
        { id: interaction.user.id },
        { $set: { idioma: novoValor } },
        { upsert: true, setDefaultsOnInsert: true }
    );
    idiomaUtil.invalidarUsuario(interaction.user.id);

    t = criarT(await idiomaUtil.resolverIdioma(interaction));

    const embed = ui.success(
        t('idioma.pessoal_alterado_titulo'),
        novoValor
            ? t('idioma.pessoal_alterado', { idioma: NOMES[novoValor] })
            : t('idioma.pessoal_automatico', { idioma: NOMES[t.locale] || t.locale })
    );

    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
};
