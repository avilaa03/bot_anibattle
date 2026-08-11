const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const Card = require('../../utils/cardSchema');
const User = require('../../utils/userSchema');
const ui = require('../../utils/embeds');
const { escapeRegex } = require('../../utils/regexUtils');
const { renderCard } = require('../../utils/cardRenderer');
const { molduraEfetiva } = require('../../utils/vip');
const { formatarNumero } = require('../../utils/dexNumbers');
const { registrar } = require('../../utils/progress');
const wishlist = require('../../utils/wishlist');
const valores = require('../../utils/cardValues');
const { tDaInteracao } = require('../../utils/language');

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
    const t = await tDaInteracao(interaction);

    const nomeBuscado = (interaction.options.getString('name') || '').trim();
    const numeroBuscado = interaction.options.getInteger('number');

    if (!nomeBuscado && numeroBuscado == null) {
        return interaction.reply({
            embeds: [ui.error(t('ficha.informe'), t('ficha.informe_texto'))],
            flags: MessageFlags.Ephemeral
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
            ? t('ficha.sem_numero', { numero: formatarNumero(numeroBuscado, totalCatalogo) })
            : t('ficha.sem_nome', { busca: nomeBuscado });
        return interaction.editReply({ embeds: [ui.error(t('comum.carta_nao_encontrada'), descricao)] });
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
            t('ficha.nao_registrada'),
            encontradas.length === 1
                ? t('ficha.nao_registrada_uma', { numero: formatarNumero(alvo.numero, totalCatalogo) })
                : t('ficha.nao_registrada_varias', { n: encontradas.length })
        ).addFields(
            { name: t('ficha.como_conseguir'), value: t('ficha.como_conseguir_texto'), inline: false },
            {
                name: t('ficha.seu_progresso'),
                value: t('ficha.progresso_texto', { descobertas: registradas.size, total: totalCatalogo }),
                inline: false
            }
        );
        return interaction.editReply({ embeds: [embed] });
    }

    // ---- Monta a ficha ----
    const moldura = molduraEfetiva(usuario);
    const inventario = usuario?.inventory || [];
    let indice = 0;

    const montarFicha = async (i) => {
        const carta = disponiveis[i];
        const meta = ui.getRarity(carta.rarity, t.locale);
        const descobertaEm = registradas.get(String(carta._id));

        // Quantas cópias dessa carta o jogador tem AGORA no inventário.
        const copias = inventario.filter(
            (c) => c.originalCardId && String(c.originalCardId) === String(carta._id)
        ).length;

        const render = await renderCard(carta, { moldura });

        const embed = ui.base(meta.color)
            .setAuthor({
                name: t('pokedex.autor', { jogador: interaction.user.username }),
                iconURL: interaction.user.displayAvatarURL()
            })
            .setTitle(`${formatarNumero(carta.numero, totalCatalogo)} • ${meta.emoji} ${ui.cardName(carta)}`)
            .setDescription([
                `*${carta.series || t('comum.traco')}*`,
                '',
                ui.statLines(carta, t.locale),
                '',
                t('roll.linha_raridade', {
                    raridade: ui.rarityTag(carta.rarity, t.locale),
                    overall: carta.overall ?? 0
                })
            ].join('\n'))
            .addFields(
                {
                    name: t('ficha.registrada_em'),
                    value: descobertaEm
                        ? `<t:${Math.floor(new Date(descobertaEm).getTime() / 1000)}:D>`
                        : t('comum.traco'),
                    inline: true
                },
                {
                    name: t('ficha.no_inventario'),
                    value: copias > 0 ? t('ficha.copias', { n: copias }) : t('ficha.nenhuma_copia'),
                    inline: true
                },
                {
                    name: t('ficha.valor_mercado'),
                    value: ui.coins(valores.valoresDaCarta(carta).marketValue, t.locale),
                    inline: true
                },
                {
                    // "Procuram" e não "disputam": a carta rolada é única
                    // e fica com quem rolou. O número mede demanda no
                    // mercado, não briga pela cópia.
                    name: t('ficha.procuram'),
                    value: t('ficha.procuram_texto', { n: await wishlist.contarDesejos(carta._id) }),
                    inline: true
                }
            )
            .setImage(render.url)
            .setFooter({
                text: disponiveis.length > 1
                    ? `${ui.BRAND} • ${t('ficha.resultado', { atual: i + 1, total: disponiveis.length })}`
                    : `${ui.BRAND} • ${t('ficha.progresso_texto', { descobertas: registradas.size, total: totalCatalogo })}`
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
                t('ficha.de_fora'),
                t('ficha.de_fora_texto', { n: encontradas.length - disponiveis.length })
            )],
            flags: MessageFlags.Ephemeral
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
