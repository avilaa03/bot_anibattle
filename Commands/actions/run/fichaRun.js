const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Card = require('../../utils/cardSchema');
const User = require('../../utils/userSchema');
const ui = require('../../utils/embeds');
const { escapeRegex } = require('../../utils/regexUtils');
const { renderCard } = require('../../utils/cardRenderer');
const { molduraEfetiva } = require('../../utils/vip');
const { formatarNumero } = require('../../utils/dexNumbers');
const { registrar } = require('../../utils/progresso');
const wishlist = require('../../utils/wishlist');

/**
 * /ficha — mostra a ficha de uma carta que o jogador JÁ REGISTROU na Pokédex.
 *
 * Diferença para o /show: o /show lista cartas que o jogador tem no
 * inventário agora. A /ficha mostra qualquer carta que ele já teve em mãos
 * alguma vez, mesmo que tenha vendido — é a consulta ao registro, não ao
 * baú. Por isso ela também informa quantas cópias ele tem no momento
 * (pode ser zero).
 */

const MAX_RESULTADOS = 10;

async function fichaRun(client, interaction) {
    const nomeBuscado = (interaction.options.getString('nome') || '').trim();
    const numeroBuscado = interaction.options.getInteger('numero');

    if (!nomeBuscado && numeroBuscado == null) {
        return interaction.reply({
            embeds: [ui.error('Informe o que procurar', 'Use `/ficha nome:Kirito` ou `/ficha numero:42`.')],
            ephemeral: true
        });
    }

    await interaction.deferReply();

    const totalCatalogo = await Card.countDocuments();

    // ---- Busca no catálogo ----
    const filtro = numeroBuscado != null
        ? { numero: numeroBuscado }
        : { name: new RegExp(escapeRegex(nomeBuscado), 'i') };

    const encontradas = await Card.find(filtro)
        .sort({ numero: 1 })
        .limit(MAX_RESULTADOS)
        .lean();

    if (encontradas.length === 0) {
        const descricao = numeroBuscado != null
            ? `Não existe nenhuma carta com o número **${formatarNumero(numeroBuscado, totalCatalogo)}** no catálogo.`
            : `Nenhuma carta no catálogo tem "${nomeBuscado}" no nome.`;
        return interaction.editReply({ embeds: [ui.error('Carta não encontrada', descricao)] });
    }

    // ---- Filtra pelas que o jogador registrou ----
    const usuario = await User.findOne({ id: interaction.user.id })
        .select('discovered inventory cosmetics vip')
        .lean();

    const registradas = new Map(
        (usuario?.discovered || []).map((d) => [String(d.cardId), d.firstObtainedAt])
    );

    const disponiveis = encontradas.filter((c) => registradas.has(String(c._id)));

    if (disponiveis.length === 0) {
        // A carta existe, mas o jogador nunca teve — não mostramos os
        // atributos dela, senão a Pokédex perderia a graça de descobrir.
        const alvo = encontradas[0];
        const embed = ui.warning(
            'Carta não registrada',
            encontradas.length === 1
                ? `Você ainda não registrou **${formatarNumero(alvo.numero, totalCatalogo)}** na sua Pokédex.\n\nVocê precisa ter tido essa carta pelo menos uma vez para consultá-la aqui.`
                : `Nenhuma das ${encontradas.length} cartas com esse nome está registrada na sua Pokédex.\n\nVocê precisa ter tido a carta pelo menos uma vez para consultá-la aqui.`
        ).addFields(
            { name: 'Como conseguir', value: 'Use `/roll` para sortear ou procure no `/market`.', inline: false },
            { name: 'Seu progresso', value: `${registradas.size} de ${totalCatalogo} cartas descobertas`, inline: false }
        );
        return interaction.editReply({ embeds: [embed] });
    }

    // ---- Monta a ficha ----
    const moldura = molduraEfetiva(usuario);
    const inventario = usuario?.inventory || [];
    let indice = 0;

    const montarFicha = async (i) => {
        const carta = disponiveis[i];
        const meta = ui.getRarity(carta.rarity);
        const descobertaEm = registradas.get(String(carta._id));

        // Quantas cópias dessa carta o jogador tem AGORA no inventário.
        const copias = inventario.filter(
            (c) => c.originalCardId && String(c.originalCardId) === String(carta._id)
        ).length;

        const render = await renderCard(carta, { moldura });

        const embed = ui.base(meta.color)
            .setAuthor({ name: `Pokédex de ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL() })
            .setTitle(`${formatarNumero(carta.numero, totalCatalogo)} • ${meta.emoji} ${ui.cardName(carta.name)}`)
            .setDescription([
                `*${carta.series || '—'}*`,
                '',
                ui.statLines(carta),
                '',
                `Raridade ${ui.rarityTag(carta.rarity)} • Overall **${carta.overall ?? 0}**`
            ].join('\n'))
            .addFields(
                {
                    name: '📖 Registrada em',
                    value: descobertaEm ? `<t:${Math.floor(new Date(descobertaEm).getTime() / 1000)}:D>` : '—',
                    inline: true
                },
                {
                    name: '🎴 No seu inventário',
                    value: copias > 0 ? `**${copias}** cópia(s)` : 'Nenhuma no momento',
                    inline: true
                },
                {
                    name: '💰 Valor de mercado',
                    value: ui.coins((carta.overall ?? 0) * 10),
                    inline: true
                },
                {
                    name: '💭 Procurada por',
                    value: `${await wishlist.contarDesejos(carta._id)} jogador(es)`,
                    inline: true
                }
            )
            .setImage(render.url)
            .setFooter({
                text: disponiveis.length > 1
                    ? `${ui.BRAND} • Resultado ${i + 1} de ${disponiveis.length}`
                    : `${ui.BRAND} • ${registradas.size} de ${totalCatalogo} cartas descobertas`
            });

        return { embed, attachment: render.attachment };
    };

    const montarBotoes = () => {
        if (disponiveis.length <= 1) return [];
        return [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('ficha_prev').setEmoji('◀️').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('ficha_next').setEmoji('▶️').setStyle(ButtonStyle.Secondary)
        )];
    };

    registrar(interaction.user.id, {}, { eventosMissao: ['consulta'], checarConquistas: false }).catch(() => {});

    const primeira = await montarFicha(indice);
    const mensagem = await interaction.editReply({
        embeds: [primeira.embed],
        components: montarBotoes(),
        files: [primeira.attachment]
    });

    // Aviso discreto quando parte dos resultados está bloqueada.
    if (disponiveis.length < encontradas.length) {
        await interaction.followUp({
            embeds: [ui.neutral(
                'Alguns resultados ficaram de fora',
                `${encontradas.length - disponiveis.length} carta(s) com esse nome ainda não estão na sua Pokédex.`
            )],
            ephemeral: true
        }).catch(() => {});
    }

    if (disponiveis.length <= 1) return;

    const filtroBotao = (i) =>
        i.user.id === interaction.user.id && ['ficha_prev', 'ficha_next'].includes(i.customId);
    const coletor = mensagem.createMessageComponentCollector({ filter: filtroBotao, time: 120000 });

    coletor.on('collect', async (i) => {
        indice = i.customId === 'ficha_prev'
            ? (indice - 1 + disponiveis.length) % disponiveis.length
            : (indice + 1) % disponiveis.length;

        await i.deferUpdate();
        const { embed, attachment } = await montarFicha(indice);
        await i.editReply({ embeds: [embed], components: montarBotoes(), files: [attachment] });
    });

    coletor.on('end', () => {
        mensagem.edit({ components: [] }).catch(() => {});
    });
}

module.exports = fichaRun;
