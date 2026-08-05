const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, MessageFlags } = require('discord.js');
const User = require('../../utils/userSchema');
const ui = require('../../utils/embeds');
const trade = require('../../utils/trade');
const valores = require('../../utils/valores');
const negociabilidade = require('../../utils/negociabilidade');

/**
 * /trocar — negociação de carta por carta.
 *
 * Fluxo: proponente desafia → alvo aceita → os dois montam a oferta com
 * menus de seleção → os dois confirmam → a troca executa.
 *
 * Qualquer mudança na oferta zera as duas confirmações, então ninguém
 * consegue confirmar uma coisa e entregar outra.
 */

const MAX_OPCOES = 25;

const getOvr = valores.overallDaCarta;

/**
 * Melhores cartas primeiro — só cabem 25 no menu.
 *
 * Carta vinculada é removida aqui: se ela aparecesse no menu e fosse
 * recusada só na confirmação, os dois lados perderiam tempo montando uma
 * oferta que nunca ia fechar.
 */
function ordenar(inventario) {
    return [...inventario].filter(negociabilidade.podeNegociar).sort((a, b) => {
        const porRaridade = ui.compareRarityDesc(a.rarity, b.rarity);
        return porRaridade !== 0 ? porRaridade : getOvr(b) - getOvr(a);
    });
}

function listarOferta(cartas) {
    if (cartas.length === 0) return '*(nada oferecido ainda)*';
    return cartas.map((c) => {
        const meta = ui.getRarity(c.rarity);
        return `${meta.emoji} **${ui.cardName(c)}** — OVR ${c.overall ?? 0} • ${ui.coins(c.marketValue || 0)}`;
    }).join('\n');
}

function valorTotal(cartas) {
    return cartas.reduce((s, c) => s + (c.marketValue || 0), 0);
}

/** Embed da mesa de negociação. */
function montarEmbed(t) {
    const valorP = valorTotal(t.proponente.cartas);
    const valorA = valorTotal(t.alvo.cartas);

    const marca = (lado) => t[lado].confirmou ? '✅' : '⏳';

    const embed = ui.base(trade.ambosConfirmaram(t) ? ui.STATUS_COLORS.success : ui.STATUS_COLORS.warning)
        .setTitle('🔄 Mesa de troca')
        .setDescription(
            'Cada um escolhe o que oferece nos menus abaixo e confirma.\n'
            + '⚠️ *Mexer na oferta cancela as confirmações dos dois lados.*'
        )
        .addFields(
            {
                name: `${marca('proponente')} ${t.proponente.username} oferece`,
                value: `${listarOferta(t.proponente.cartas)}\n\n**Total:** ${ui.coins(valorP)}`,
                inline: true
            },
            {
                name: `${marca('alvo')} ${t.alvo.username} oferece`,
                value: `${listarOferta(t.alvo.cartas)}\n\n**Total:** ${ui.coins(valorA)}`,
                inline: true
            }
        );

    // Aviso de desequilíbrio: não bloqueia, só chama atenção.
    const maior = Math.max(valorP, valorA);
    const menor = Math.min(valorP, valorA);
    if (maior > 0 && menor > 0 && maior >= menor * 3) {
        embed.addFields({
            name: '⚠️ Troca desequilibrada',
            value: 'Um lado está oferecendo bem mais que o outro. Confira antes de confirmar.',
            inline: false
        });
    }

    if (trade.ambosConfirmaram(t)) {
        embed.setFooter({ text: `${ui.BRAND} • Os dois confirmaram — executando...` });
    } else {
        embed.setFooter({ text: `${ui.BRAND} • A negociação expira em 10 minutos` });
    }

    return embed;
}

/** Menus de seleção e botões da mesa. */
function montarComponentes(t, inventarios) {
    const linhas = [];

    for (const lado of ['proponente', 'alvo']) {
        const inventario = ordenar(inventarios[lado] || []).slice(0, MAX_OPCOES);
        if (inventario.length === 0) continue;

        const selecionadas = new Set(t[lado].cartas.map((c) => String(c.inventoryId)));

        const opcoes = inventario.map((carta) => {
            const meta = ui.getRarity(carta.rarity);
            return {
                label: `${ui.cardName(carta)} · OVR ${getOvr(carta)}`.slice(0, 100),
                description: `${meta.label} • ${carta.series || '—'}`.slice(0, 100),
                value: String(carta._id),
                emoji: meta.emoji,
                default: selecionadas.has(String(carta._id))
            };
        });

        linhas.push(new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`trade_pick_${t.tradeId}_${lado}`)
                .setPlaceholder(`${t[lado].username}: escolher cartas para oferecer`)
                .setMinValues(0)
                .setMaxValues(Math.min(trade.MAX_CARTAS, opcoes.length))
                .addOptions(opcoes)
        ));
    }

    linhas.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`trade_confirm_${t.tradeId}`)
            .setLabel('Confirmar troca')
            .setEmoji('✅')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`trade_cancel_${t.tradeId}`)
            .setLabel('Cancelar')
            .setStyle(ButtonStyle.Danger)
    ));

    return linhas;
}

async function trocarRun(client, interaction) {
    const proponente = interaction.user;
    const alvo = interaction.options.getUser('user');

    const recusar = (titulo, descricao) =>
        interaction.reply({ embeds: [ui.error(titulo, descricao)], flags: MessageFlags.Ephemeral });

    if (!alvo) return recusar('Usuário necessário', 'Mencione com quem você quer trocar.');
    if (alvo.bot) return recusar('Alvo inválido', 'Bots não trocam cartas.');
    if (alvo.id === proponente.id) return recusar('Alvo inválido', 'Você não pode trocar consigo mesmo.');

    if (await trade.temTrocaAtiva(proponente.id)) {
        return recusar('Negociação em andamento', 'Você já tem uma troca aberta. Termine ou cancele antes de abrir outra.');
    }
    if (await trade.temTrocaAtiva(alvo.id)) {
        return recusar('Jogador ocupado', `**${alvo.username}** já está em uma negociação.`);
    }

    const [docP, docA] = await Promise.all([
        User.findOne({ id: proponente.id }).select('inventory').lean(),
        User.findOne({ id: alvo.id }).select('inventory').lean()
    ]);

    if (!docP || (docP.inventory || []).length === 0) {
        return recusar('Inventário vazio', 'Você não tem cartas para trocar. Use `/roll` primeiro.');
    }
    if (!docA || (docA.inventory || []).length === 0) {
        return recusar('Inventário vazio', `**${alvo.username}** não tem cartas para trocar.`);
    }

    const t = await trade.criar(proponente, alvo, interaction.channelId);

    const convite = ui.base(ui.STATUS_COLORS.warning)
        .setTitle('🔄 Proposta de troca')
        .setDescription(`**${proponente.username}** quer trocar cartas com **${alvo.username}**.`)
        .addFields(
            { name: proponente.username, value: `🎴 ${docP.inventory.length} cartas`, inline: true },
            { name: '⇄', value: '​', inline: true },
            { name: alvo.username, value: `🎴 ${docA.inventory.length} cartas`, inline: true }
        )
        .setFooter({ text: `${ui.BRAND} • O convite expira em 60 segundos` });

    const botoes = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`trade_accept_${t.tradeId}`).setLabel('Aceitar').setEmoji('🔄').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`trade_decline_${t.tradeId}`).setLabel('Recusar').setStyle(ButtonStyle.Secondary),
        // Quem convidou também precisa de saída.
        //
        // Antes só o convidado tinha botão: o coletor abaixo filtra por
        // `i.user.id === alvo.id`. Se o convidado sumia, o proponente
        // ficava preso — `temTrocaAtiva` conta 'aguardando' como ocupado e
        // ele não conseguia abrir outra troca até o convite expirar.
        //
        // Este botão vai pelo handler global (`trade_cancel_`), não pelo
        // coletor, então continua funcionando depois de um restart do bot.
        new ButtonBuilder().setCustomId(`trade_cancel_${t.tradeId}`).setLabel('Cancelar convite').setEmoji('🚫').setStyle(ButtonStyle.Danger)
    );

    await interaction.reply({
        content: `${alvo}, você recebeu uma proposta de troca!`,
        embeds: [convite],
        components: [botoes]
    });
    const mensagem = await interaction.fetchReply();

    t.mensagemId = mensagem.id;
    await t.save();

    // O convite (aceitar/recusar) é resolvido aqui; o resto da mesa é
    // tratado pelo handler global, porque a mesa vive mais que este coletor.
    const filtro = (i) => i.user.id === alvo.id && [`trade_accept_${t.tradeId}`, `trade_decline_${t.tradeId}`].includes(i.customId);
    const coletor = mensagem.createMessageComponentCollector({ filter: filtro, time: 60000, max: 1 });

    coletor.on('collect', async (i) => {
        if (i.customId === `trade_decline_${t.tradeId}`) {
            await trade.apagar(t.tradeId);
            return i.update({
                content: null,
                embeds: [ui.neutral('Troca recusada', `**${alvo.username}** recusou a proposta.`)],
                components: []
            });
        }

        const atualizada = await trade.buscar(t.tradeId);
        if (!atualizada) {
            return i.update({ content: null, embeds: [ui.error('Troca expirada', 'Essa negociação não existe mais.')], components: [] });
        }

        atualizada.fase = 'montando';
        await atualizada.save();

        const inventarios = {
            proponente: docP.inventory,
            alvo: docA.inventory
        };

        await i.update({
            content: `${proponente} ⇄ ${alvo}`,
            embeds: [montarEmbed(atualizada)],
            components: montarComponentes(atualizada, inventarios)
        });
    });

    coletor.on('end', async (coletadas) => {
        if (coletadas.size === 0) {
            const atual = await trade.buscar(t.tradeId);
            if (atual && atual.fase === 'aguardando') {
                await trade.apagar(t.tradeId);
                mensagem.edit({
                    content: null,
                    embeds: [ui.neutral('Proposta expirada', `**${alvo.username}** não respondeu a tempo.`)],
                    components: []
                }).catch(() => {});
            }
        }
    });
}

module.exports = trocarRun;
module.exports.montarEmbed = montarEmbed;
module.exports.montarComponentes = montarComponentes;
