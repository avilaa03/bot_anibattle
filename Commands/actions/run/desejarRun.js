const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const Card = require('../../utils/cardSchema');
const User = require('../../utils/userSchema');
const ui = require('../../utils/embeds');
const { escapeRegex } = require('../../utils/regexUtils');
const { formatarNumero } = require('../../utils/dexNumbers');
const wishlist = require('../../utils/wishlist');
const { tDaInteracao } = require('../../utils/idioma');

/**
 * /desejar — adiciona ou remove uma carta da lista de desejos.
 *
 * Diferente da Pokédex, aqui o jogador pode desejar carta que nunca teve
 * — é justamente esse o ponto: marcar o que você está caçando.
 */
async function desejarRun(client, interaction) {
    const t = await tDaInteracao(interaction);
    const nome = (interaction.options.getString('nome') || '').trim();
    const numero = interaction.options.getInteger('numero');
    const remover = interaction.options.getBoolean('remover') || false;

    if (!nome && numero == null) {
        return interaction.reply({
            embeds: [ui.error(t('desejar.informe'), t('desejar.informe_texto'))],
            flags: MessageFlags.Ephemeral
        });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const totalCatalogo = await Card.countDocuments();
    const filtro = numero != null
        ? { numero }
        : { name: new RegExp(escapeRegex(nome), 'i') };

    const encontradas = await Card.find(filtro).sort({ numero: 1 }).limit(10).lean();

    if (encontradas.length === 0) {
        return interaction.editReply({
            embeds: [ui.error(t('comum.carta_nao_encontrada'), numero != null
                ? t('desejar.sem_numero', { numero: formatarNumero(numero, totalCatalogo) })
                : t('desejar.sem_nome', { nome }))]
        });
    }

    // Mais de um resultado: pede para escolher.
    if (encontradas.length > 1) {
        const lista = encontradas.map((c) => {
            const meta = ui.getRarity(c.rarity, t.locale);
            return `${formatarNumero(c.numero, totalCatalogo)} ${meta.emoji} **${ui.cardName(c.name, t.locale)}** — *${c.series}*`;
        }).join('\n');

        return interaction.editReply({
            embeds: [ui.neutral(t('desejar.varias'), t('desejar.varias_texto', { lista }))]
        });
    }

    const carta = encontradas[0];
    const meta = ui.getRarity(carta.rarity, t.locale);
    const user = await User.findOne({ id: interaction.user.id }).lean();

    // ---- Remover ----
    if (remover) {
        const removeu = await wishlist.remover(interaction.user.id, carta._id);
        const nomeCarta = ui.cardName(carta.name, t.locale);
        return interaction.editReply({
            embeds: [removeu
                ? ui.success(t('desejar.removida'), t('desejar.removida_texto', { emoji: meta.emoji, carta: nomeCarta }))
                : ui.neutral(t('desejar.nao_estava'), t('desejar.nao_estava_texto', { emoji: meta.emoji, carta: nomeCarta }))]
        });
    }

    // ---- Adicionar ----
    const resultado = await wishlist.adicionar(interaction.user.id, carta._id);

    if (!resultado.ok) {
        if (resultado.motivo === 'JA_TEM') {
            return interaction.editReply({
                embeds: [ui.neutral(t('desejar.ja_na_lista'), t('desejar.ja_na_lista_texto', {
                    emoji: meta.emoji,
                    carta: ui.cardName(carta.name, t.locale),
                    nome: carta.name
                }))]
            });
        }
        if (resultado.motivo === 'LIMITE') {
            return interaction.editReply({
                embeds: [ui.warning(t('desejar.lista_cheia'), t('desejar.lista_cheia_texto', {
                    total: resultado.total,
                    limite: resultado.limite
                }))]
            });
        }
        return interaction.editReply({
            embeds: [ui.error(t('comum.perfil_nao_encontrado'), t('comum.perfil_nao_encontrado_texto'))]
        });
    }

    const jaTem = (user?.discovered || []).some((d) => String(d.cardId) === String(carta._id));
    const quantosDesejam = await wishlist.contarDesejos(carta._id);

    const embed = ui.success(
        t('desejar.adicionada'),
        t('desejar.adicionada_texto', {
            emoji: meta.emoji,
            carta: ui.cardName(carta.name, t.locale),
            serie: carta.series
        })
    )
        .addFields(
            { name: t('desejar.numero'), value: formatarNumero(carta.numero, totalCatalogo), inline: true },
            { name: t('desejar.sua_lista'), value: `${resultado.total} / ${resultado.limite}`, inline: true },
            { name: t('desejar.tambem_procuram'), value: t('desejar.n_jogadores', { n: quantosDesejam }), inline: true }
        )
        .addFields({
            name: t('desejar.o_que_faz'),
            value: t('desejar.o_que_faz_texto'),
            inline: false
        })
        .setFooter({ text: `${ui.BRAND} • ${t('desejar.rodape')}` });

    if (jaTem) {
        embed.setDescription(`${embed.data.description}\n\n${t('desejar.ja_registrou')}`);
    }

    return interaction.editReply({ embeds: [embed] });
}

module.exports = desejarRun;
