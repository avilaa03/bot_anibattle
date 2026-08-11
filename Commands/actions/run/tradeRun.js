const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, MessageFlags } = require('discord.js');
const User = require('../../utils/userSchema');
const ui = require('../../utils/embeds');
const trade = require('../../utils/trade');
const valores = require('../../utils/cardValues');
const negociabilidade = require('../../utils/tradability');
const { tDaInteracao, tDoUsuario } = require('../../utils/language');

/**
 * /trocar — negociação de carta por carta.
 *
 * Fluxo: proponente desafia → alvo aceita → os dois montam a oferta com
 * menus de seleção → os dois confirmam → a troca executa.
 *
 * Qualquer mudança na oferta zera as duas confirmações, então ninguém
 * consegue confirmar uma coisa e entregar outra.
 *
 * ## Em que idioma a mesa fala
 *
 * No do SERVIDOR, não no de quem clicou — mesmo critério do quadro do
 * torneio. A mesa é uma mensagem só, editada a cada escolha de carta, e
 * fica no canal por até dez minutos com os dois lados mexendo nela. Se
 * seguisse o clique, ela trocaria de idioma a cada carta escolhida, e o
 * jogador veria o texto virar na frente dele por causa de uma ação do
 * outro.
 *
 * O que é resposta privada a um clique (erro, recusa, aviso) continua
 * saindo no idioma de quem clicou: aquilo só a pessoa vê.
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

function listarOferta(cartas, t) {
    if (cartas.length === 0) return t('trocar.nada_oferecido');
    return cartas.map((c) => {
        const meta = ui.getRarity(c.rarity, t.locale);
        return `${meta.emoji} **${ui.cardName(c)}** — ${t('atributos.ovr')} ${c.overall ?? 0} • ${ui.coins(c.marketValue || 0, t.locale)}`;
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

    const embed = ui.base(trade.ambosConfirmaram(troca) ? ui.STATUS_COLORS.success : ui.STATUS_COLORS.warning)
        .setTitle(t('trocar.mesa_titulo'))
        .setDescription(t('trocar.mesa_descricao'))
        .addFields(
            {
                name: `${marca('proponente')} ${t('trocar.oferece', { jogador: troca.proponente.username })}`,
                value: `${listarOferta(troca.proponente.cartas, t)}\n\n${t('trocar.total', { valor: ui.coins(valorP, t.locale) })}`,
                inline: true
            },
            {
                name: `${marca('alvo')} ${t('trocar.oferece', { jogador: troca.alvo.username })}`,
                value: `${listarOferta(troca.alvo.cartas, t)}\n\n${t('trocar.total', { valor: ui.coins(valorA, t.locale) })}`,
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
                label: `${ui.cardName(carta)} · ${t('atributos.ovr')} ${getOvr(carta)}`.slice(0, 100),
                description: `${meta.label} • ${carta.series || '—'}`.slice(0, 100),
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
    // Duas vozes: a de quem digitou o comando, para os erros que só ele
    // vê, e a do servidor, para o convite e a mesa que ficam no canal.
    const t = await tDaInteracao(interaction);
    const tMesa = await tDoUsuario(null, interaction.guildId);

    const proponente = interaction.user;
    const alvo = interaction.options.getUser('user');

    const recusar = (tituloChave, descricaoChave, valores) =>
        interaction.reply({
            embeds: [ui.error(t(tituloChave), t(descricaoChave, valores))],
            flags: MessageFlags.Ephemeral
        });

    if (!alvo) return recusar('trocar.usuario_necessario', 'trocar.usuario_necessario_texto');
    if (alvo.bot) return recusar('trocar.alvo_invalido', 'trocar.sem_bots');
    if (alvo.id === proponente.id) return recusar('trocar.alvo_invalido', 'trocar.sem_si_mesmo');


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
        .setTitle(tMesa('trocar.proposta_titulo'))
        .setDescription(tMesa('trocar.proposta_texto', {
            proponente: proponente.username,
            alvo: alvo.username
        }))
        .addFields(
            {
                name: proponente.username,
                value: tMesa('trocar.n_cartas', { n: docP.inventory.length }),
                inline: true
            },
            { name: '⇄', value: '​', inline: true },
            {
                name: alvo.username,
                value: tMesa('trocar.n_cartas', { n: docA.inventory.length }),
                inline: true
            }
        )
        .setFooter({ text: `${ui.BRAND} • ${tMesa('trocar.rodape_convite')}` });

    const botoes = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`trade_accept_${troca.tradeId}`).setLabel(tMesa('trocar.botao_aceitar')).setEmoji('🔄').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`trade_decline_${troca.tradeId}`).setLabel(tMesa('trocar.botao_recusar')).setStyle(ButtonStyle.Secondary),
        // Quem convidou também precisa de saída.
        //
        // Antes só o convidado tinha botão: o coletor abaixo filtra por
        // `i.user.id === alvo.id`. Se o convidado sumia, o proponente
        // ficava preso — `temTrocaAtiva` conta 'aguardando' como ocupado e
        // ele não conseguia abrir outra troca até o convite expirar.
        //
        // Este botão vai pelo handler global (`trade_cancel_`), não pelo
        // coletor, então continua funcionando depois de um restart do bot.
        new ButtonBuilder().setCustomId(`trade_cancel_${troca.tradeId}`).setLabel(tMesa('trocar.botao_cancelar_convite')).setEmoji('🚫').setStyle(ButtonStyle.Danger)
    );

    await interaction.reply({
        content: tMesa('trocar.mencao_proposta', { alvo: String(alvo) }),
        embeds: [convite],
        components: [botoes]
    });
    const mensagem = await interaction.fetchReply();

    troca.mensagemId = mensagem.id;
    await troca.save();

    // Aceitar e recusar agora vão pelo handler global, junto do cancelar.
    //
    // Eles moravam num coletor aqui, e isso era a causa do "o bot não
    // respondeu a tempo": o coletor morre quando o bot reinicia, e com
    // deploy automático a cada merge, todo convite aberto virava um botão
    // que ninguém escutava. Ver o cabeçalho do bloco `accept` em
    // `handlers/tradeHandler.js`.
    //
    // Sobra aqui só a expiração, que é um temporizador e não depende de
    // interação nenhuma. Ele também não sobrevive a um restart — mas o
    // pior caso é uma proposta velha ficar na tela, e o `temTrocaAtiva`
    // não trava ninguém porque a varredura de trocas abandonadas continua
    // rodando.
    setTimeout(async () => {
        const atual = await trade.buscar(troca.tradeId).catch(() => null);
        if (atual && atual.fase === 'aguardando') {
            await trade.apagar(troca.tradeId).catch(() => {});
            mensagem.edit({
                content: null,
                embeds: [ui.neutral(
                    tMesa('trocar.proposta_expirada'),
                    tMesa('trocar.proposta_expirada_texto', { jogador: alvo.username })
                )],
                components: []
            }).catch(() => {});
        }
    }, 60000).unref?.();
}

module.exports = trocarRun;
module.exports.montarEmbed = montarEmbed;
module.exports.montarComponentes = montarComponentes;
