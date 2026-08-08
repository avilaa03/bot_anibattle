const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, MessageFlags } = require('discord.js');
const User = require('../../utils/userSchema');
const ui = require('../../utils/embeds');
const trade = require('../../utils/trade');
const { tDaInteracao } = require('../../utils/idioma');

/**
 * /trocar — negociação de carta por carta.
 *
 * Fluxo: proponente desafia → alvo aceita → os dois montam a oferta com
 * menus de seleção → os dois confirmam → a troca executa.
 *
 * Qualquer mudança na oferta zera as duas confirmações, então ninguém
 * consegue confirmar uma coisa e entregar outra.
 *
 * Convenção deste arquivo: `troca` é o documento da negociação e `t` é o
 * tradutor — igual ao resto do bot.
 */

const MAX_OPCOES = 25;

function getOvr(card) {
    return card.overall ?? (card.marketValue != null ? Math.round(card.marketValue / 10) : 0);
}

/** Melhores cartas primeiro — só cabem 25 no menu. */
function ordenar(inventario) {
    return [...inventario].sort((a, b) => {
        const porRaridade = ui.compareRarityDesc(a.rarity, b.rarity);
        return porRaridade !== 0 ? porRaridade : getOvr(b) - getOvr(a);
    });
}

function listarOferta(cartas, t) {
    if (cartas.length === 0) return t('trocar.nada_oferecido');
    return cartas.map((c) => {
        const meta = ui.getRarity(c.rarity, t.locale);
        return `${meta.emoji} **${ui.cardName(c.name, t.locale)}** — ${t('atributos.ovr')} ${c.overall ?? 0} • ${ui.coins(c.marketValue || 0, t.locale)}`;
    }).join('\n');
}

function valorTotal(cartas) {
    return cartas.reduce((s, c) => s + (c.marketValue || 0), 0);
}

/** Embed da mesa de negociação. */
function montarEmbed(troca, t) {
    const valorP = valorTotal(troca.proponente.cartas);
    const valorA = valorTotal(troca.alvo.cartas);

    const marca = (lado) => troca[lado].confirmou ? '✅' : '⏳';
    const bloco = (lado, valor) =>
        `${listarOferta(troca[lado].cartas, t)}\n\n${t('trocar.total', { valor: ui.coins(valor, t.locale) })}`;

    const embed = ui.base(trade.ambosConfirmaram(troca) ? ui.STATUS_COLORS.success : ui.STATUS_COLORS.warning)
        .setTitle(t('trocar.mesa_titulo'))
        .setDescription(t('trocar.mesa_descricao'))
        .addFields(
            {
                name: `${marca('proponente')} ${t('trocar.oferece', { jogador: troca.proponente.username })}`,
                value: bloco('proponente', valorP),
                inline: true
            },
            {
                name: `${marca('alvo')} ${t('trocar.oferece', { jogador: troca.alvo.username })}`,
                value: bloco('alvo', valorA),
                inline: true
            }
        );

    // Aviso de desequilíbrio: não bloqueia, só chama atenção.
    const maior = Math.max(valorP, valorA);
    const menor = Math.min(valorP, valorA);
    if (maior > 0 && menor > 0 && maior >= menor * 3) {
        embed.addFields({
            name: t('trocar.desequilibrada'),
            value: t('trocar.desequilibrada_texto'),
            inline: false
        });
    }

    if (trade.ambosConfirmaram(troca)) {
        embed.setFooter({ text: `${ui.BRAND} • ${t('trocar.rodape_executando')}` });
    } else {
        embed.setFooter({ text: `${ui.BRAND} • ${t('trocar.rodape_expira')}` });
    }

    return embed;
}

/** Menus de seleção e botões da mesa. */
function montarComponentes(troca, inventarios, t) {
    const linhas = [];

    for (const lado of ['proponente', 'alvo']) {
        const inventario = ordenar(inventarios[lado] || []).slice(0, MAX_OPCOES);
        if (inventario.length === 0) continue;

        const selecionadas = new Set(troca[lado].cartas.map((c) => String(c.inventoryId)));

        const opcoes = inventario.map((carta) => {
            const meta = ui.getRarity(carta.rarity, t.locale);
            return {
                label: `${ui.cardName(carta.name, t.locale)} · ${t('atributos.ovr')} ${getOvr(carta)}`.slice(0, 100),
                description: `${meta.label} • ${carta.series || t('comum.traco')}`.slice(0, 100),
                value: String(carta._id),
                emoji: meta.emoji,
                default: selecionadas.has(String(carta._id))
            };
        });

        linhas.push(new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`trade_pick_${troca.tradeId}_${lado}`)
                .setPlaceholder(t('trocar.placeholder', { jogador: troca[lado].username }).slice(0, 150))
                .setMinValues(0)
                .setMaxValues(Math.min(trade.MAX_CARTAS, opcoes.length))
                .addOptions(opcoes)
        ));
    }

    linhas.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`trade_confirm_${troca.tradeId}`)
            .setLabel(t('trocar.botao_confirmar'))
            .setEmoji('✅')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`trade_cancel_${troca.tradeId}`)
            .setLabel(t('comum.cancelar'))
            .setStyle(ButtonStyle.Danger)
    ));

    return linhas;
}

async function trocarRun(client, interaction) {
    const t = await tDaInteracao(interaction);
    const proponente = interaction.user;
    const alvo = interaction.options.getUser('user');

    const recusar = (tituloChave, descricaoChave, valores) =>
        interaction.reply({
            embeds: [ui.error(t(tituloChave), t(descricaoChave, valores))],
            flags: MessageFlags.Ephemeral
        });

    if (!alvo) return recusar('trocar.usuario_necessario', 'trocar.usuario_necessario_texto');
    if (alvo.bot) return recusar('battle.alvo_invalido', 'trocar.sem_bots');
    if (alvo.id === proponente.id) return recusar('battle.alvo_invalido', 'trocar.sem_si_mesmo');

    if (await trade.temTrocaAtiva(proponente.id)) {
        return recusar('trocar.em_andamento', 'trocar.em_andamento_texto');
    }
    if (await trade.temTrocaAtiva(alvo.id)) {
        return recusar('trocar.jogador_ocupado', 'trocar.jogador_ocupado_texto', { jogador: alvo.username });
    }

    const [docP, docA] = await Promise.all([
        User.findOne({ id: proponente.id }).select('inventory').lean(),
        User.findOne({ id: alvo.id }).select('inventory').lean()
    ]);

    if (!docP || (docP.inventory || []).length === 0) {
        return recusar('comum.inventario_vazio', 'trocar.voce_sem_cartas');
    }
    if (!docA || (docA.inventory || []).length === 0) {
        return recusar('comum.inventario_vazio', 'trocar.alvo_sem_cartas', { jogador: alvo.username });
    }

    const troca = await trade.criar(proponente, alvo, interaction.channelId);

    const convite = ui.base(ui.STATUS_COLORS.warning)
        .setTitle(t('trocar.proposta_titulo'))
        .setDescription(t('trocar.proposta_texto', {
            proponente: proponente.username,
            alvo: alvo.username
        }))
        .addFields(
            { name: proponente.username, value: t('trocar.n_cartas', { n: docP.inventory.length }), inline: true },
            { name: '⇄', value: '​', inline: true },
            { name: alvo.username, value: t('trocar.n_cartas', { n: docA.inventory.length }), inline: true }
        )
        .setFooter({ text: `${ui.BRAND} • ${t('trocar.rodape_convite')}` });

    const botoes = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`trade_accept_${troca.tradeId}`).setLabel(t('trocar.botao_aceitar')).setEmoji('🔄').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`trade_decline_${troca.tradeId}`).setLabel(t('battle.botao_recusar')).setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({
        content: t('trocar.mencao_proposta', { alvo: String(alvo) }),
        embeds: [convite],
        components: [botoes]
    });
    const mensagem = await interaction.fetchReply();

    troca.mensagemId = mensagem.id;
    await troca.save();

    // O convite (aceitar/recusar) é resolvido aqui; o resto da mesa é
    // tratado pelo handler global, porque a mesa vive mais que este coletor.
    const filtro = (i) => i.user.id === alvo.id && [`trade_accept_${troca.tradeId}`, `trade_decline_${troca.tradeId}`].includes(i.customId);
    const coletor = mensagem.createMessageComponentCollector({ filter: filtro, time: 60000, max: 1 });

    coletor.on('collect', async (i) => {
        // Quem clica aqui é o ALVO, não quem abriu o comando — então a
        // mesa passa a falar o idioma dele a partir deste ponto.
        const tAlvo = await tDaInteracao(i);

        if (i.customId === `trade_decline_${troca.tradeId}`) {
            await trade.apagar(troca.tradeId);
            return i.update({
                content: null,
                embeds: [ui.neutral(
                    tAlvo('trocar.recusada'),
                    tAlvo('trocar.recusada_texto', { jogador: alvo.username })
                )],
                components: []
            });
        }

        const atualizada = await trade.buscar(troca.tradeId);
        if (!atualizada) {
            return i.update({
                content: null,
                embeds: [ui.error(tAlvo('trocar.expirada'), tAlvo('trocar.expirada_texto'))],
                components: []
            });
        }

        atualizada.fase = 'montando';
        await atualizada.save();

        const inventarios = {
            proponente: docP.inventory,
            alvo: docA.inventory
        };

        await i.update({
            content: `${proponente} ⇄ ${alvo}`,
            embeds: [montarEmbed(atualizada, tAlvo)],
            components: montarComponentes(atualizada, inventarios, tAlvo)
        });
    });

    coletor.on('end', async (coletadas) => {
        if (coletadas.size === 0) {
            const atual = await trade.buscar(troca.tradeId);
            if (atual && atual.fase === 'aguardando') {
                await trade.apagar(troca.tradeId);
                mensagem.edit({
                    content: null,
                    embeds: [ui.neutral(
                        t('trocar.proposta_expirada'),
                        t('trocar.proposta_expirada_texto', { jogador: alvo.username })
                    )],
                    components: []
                }).catch(() => {});
            }
        }
    });
}

module.exports = trocarRun;
module.exports.montarEmbed = montarEmbed;
module.exports.montarComponentes = montarComponentes;
