const { renderCard } = require('../../utils/cardRenderer');
const Card = require('../../utils/cardSchema');
const User = require('../../utils/userSchema');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const ui = require('../../utils/embeds');
const vip = require('../../utils/vip');
const { getPerks, molduraEfetiva } = vip;
const { tDaInteracao, tDoUsuario } = require('../../utils/language');
const wishlist = require('../../utils/wishlist');
const { registrar } = require('../../utils/progress');
const { notificarProgresso } = require('../../utils/notifications');
const valores = require('../../utils/cardValues');
const telemetria = require('../../utils/telemetry');
const sorteio = require('../../utils/draw');
const bolsa = require('../../utils/bag');
const rollExtra = require('../../utils/extraRoll');
const nivel = require('../../utils/level');

/**
 * Menciona no canal quem tem a carta na lista de desejos.
 * Falhar aqui nunca pode atrapalhar o /roll — por isso a chamada é
 * disparada sem await e com catch.
 */
async function avisarDesejantes(interaction, card, rarityMeta, t) {
    const desejantes = await wishlist.quemDeseja(card._id, interaction.user.id);
    if (desejantes.length === 0) return;

    const mencoes = desejantes.map((id) => `<@${id}>`).join(' ');
    const embed = ui.base(rarityMeta.color)
        .setTitle(t('roll.desejo_titulo'))
        .setDescription(t('roll.desejo_texto', {
            emoji: rarityMeta.emoji,
            // A carta inteira, não `card.name`: só assim o `(+3)` da carta
            // aprimorada aparece. Passar o nome funciona e perde o selo.
            carta: ui.cardName(card),
            serie: card.series,
            jogador: interaction.user.username
        }));

    await interaction.followUp({ content: mencoes, embeds: [embed] }).catch(() => {});
}

// Coletores ativos por usuário — antes isto era uma única variável de módulo
// compartilhada por TODOS os usuários, o que fazia o /roll de um jogador
// cancelar silenciosamente o botão de outro jogador que tivesse rolado
// pouco antes. Agora cada usuário só derruba o próprio coletor anterior.
const activeCollectors = new Map();

const DEFAULT_ROLL_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutos
const ROLL_COOLDOWN_MS = Number(process.env.ROLL_COOLDOWN_MS) > 0
    ? Number(process.env.ROLL_COOLDOWN_MS)
    : DEFAULT_ROLL_COOLDOWN_MS;

function errorEmbed(t, chave) {
    return ui.error(t('comum.erro'), t(chave));
}

/** Sorteia uma carta aleatória de uma raridade usando amostragem no banco,
 * em vez de carregar toda a raridade na memória a cada roll. */
async function sampleCardByRarity(rarity) {
    const results = await Card.aggregate([
        // `distribuivel: false` tira a carta de rotação sem apagá-la.
        //
        // Carta de evento já estaria fora por outro caminho — a raridade
        // `event` nunca aparece em `sorteio.tabelaDeChances`. Esta é a
        // segunda trava, e a que permite recolher uma carta normal.
        { $match: { rarity, distribuivel: { $ne: false } } },
        { $sample: { size: 1 } }
    ]);
    return results[0] || null;
}

module.exports = async (client, interaction, rollCollect, rollEnd) => {
    const t = await tDaInteracao(interaction);

    let user;
    try {
        user = await User.findOne({ id: interaction.user.id });
    } catch (err) {
        console.error('Erro ao buscar as informações do usuário:', err);
        return interaction.reply({ embeds: [errorEmbed(t, 'roll.erro_busca')], flags: MessageFlags.Ephemeral });
    }

    const now = Date.now();

    // VIP encurta o cooldown. É a única vantagem paga que encosta na
    // economia, por isso é modesta (no máximo -40%) e nunca mexe na
    // chance de raridade — o sorteio é igual para todo mundo.
    const perks = getPerks(user);
    const cooldownEfetivo = Math.round(ROLL_COOLDOWN_MS * perks.rollCooldownMultiplier);

    // Cargas: quantos rolls não usados o jogador acumulou, até o teto do
    // nível dele. Abaixo do nível 10 o teto é 1, e a conta devolve
    // exatamente o comportamento de sempre — por isso ninguém que já joga
    // percebe diferença e não há migração.
    const nivelAtual = nivel.nivelDoXp(user?.xp);
    const teto = nivel.maxCargas(nivelAtual) + (perks.cargasExtras || 0);
    const cargas = nivel.cargasDisponiveis(user?.lastRoll, cooldownEfetivo, teto, now);

    const noCooldown = Boolean(user && user.lastRoll && cargas === 0);

    // O roll extra é um recurso PARALELO ao cooldown.
    //
    // Usar um não adianta nem reinicia o relógio normal: quem gastou o
    // extra às 14h continua com o roll grátis chegando na hora de sempre.
    // Por isso `usouExtra` desliga a gravação de `lastRoll` lá embaixo —
    // se ele fosse atualizado, o extra custaria o roll seguinte, e o
    // jogador teria pago para não ganhar nada.
    let usouExtra = false;

    if (noCooldown) {
        const querExtra = interaction.options?.getBoolean?.('extra') ?? false;
        const guardados = bolsa.quantidadeDe(user, rollExtra.CHAVE_BOLSA);

        if (querExtra) {
            // Consumo atômico: quem decide se há extra é o banco, na mesma
            // escrita. Dois `/roll extra` clicados junto gastariam o mesmo.
            const apos = await bolsa.consumir(interaction.user.id, rollExtra.CHAVE_BOLSA, 1);
            if (!apos) {
                return interaction.reply({
                    embeds: [ui.warning(t('roll.sem_extra'), [
                        t('roll.sem_extra_texto'),
                        '',
                        t('roll.sem_extra_onde_comprar')
                    ].join('\n'))],
                    flags: MessageFlags.Ephemeral
                });
            }
            usouExtra = true;
        } else {
            const timeRemaining = cooldownEfetivo - (now - user.lastRoll);
            const readyAt = Math.floor((now + timeRemaining) / 1000);
            const embed = ui.warning(t('roll.cooldown_titulo'), t('roll.cooldown_texto', { quando: readyAt }))
                .addFields(
                    { name: t('roll.tempo_restante'), value: ui.duration(timeRemaining, t.locale), inline: true },
                    { name: t('roll.seu_intervalo'), value: ui.duration(cooldownEfetivo, t.locale), inline: true }
                );

            // Só oferece o atalho para quem já tem. Anunciar a loja aqui
            // seria empurrar compra na hora da frustração.
            if (guardados > 0) {
                embed.addFields({
                    name: t('roll.campo_extra'),
                    value: t('roll.tem_extra_guardado', { quantidade: ui.number(guardados, t.locale) }),
                    inline: false
                });
            }

            if (perks.vip) {
                embed.setFooter({
                    text: `${ui.BRAND} • ${perks.tier.emoji} ${t('roll.rodape_vip', {
                        plano: vip.nomeTier(perks.tier.key, t.locale),
                        porcento: Math.round((1 - perks.rollCooldownMultiplier) * 100)
                    })}`
                });
            } else {
                embed.setFooter({ text: `${ui.BRAND} • ${t('roll.rodape_sem_vip')}` });
            }
            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }
    }

    // Telemetria: quanto tempo depois do cooldown vencer este roll chegou.
    //
    // Precisa ser calculado AQUI, antes de `lastRoll` ser sobrescrito lá
    // embaixo — depois disso o instante anterior não existe mais em lugar
    // nenhum. Este era exatamente o dado que o bot vinha jogando fora a
    // cada roll desde sempre.
    //
    // Sem await e com catch: telemetria nunca pode atrasar nem derrubar o
    // /roll de ninguém.
    //
    // Roll extra fica de fora da medição: ele acontece DENTRO do cooldown,
    // então o "atraso" seria negativo e contaria como pontualidade
    // sobre-humana. Um jogador que compra extras viraria suspeito de macro
    // por ter gastado dinheiro — exatamente o falso positivo que a
    // telemetria existe para evitar.
    if (!usouExtra) {
        const prontoEm = user?.lastRoll ? user.lastRoll + cooldownEfetivo : null;
        telemetria.registrarRoll(interaction.user.id, { agora: now, prontoEm })
            .catch((err) => console.error('Erro ao registrar telemetria do roll:', err.message));
    }

    await interaction.deferReply();

    // A tabela de chances e a proteção contra azar vivem em
    // `utils/sorteio.js`, onde dá para testar a distribuição sem subir um
    // cliente de Discord.
    const contadores = {
        rollsSemUltra: user?.rollsSemUltra ?? 0,
        rollsSemLendaria: user?.rollsSemLendaria ?? 0
    };
    const { raridade, garantida } = sorteio.sortearRaridade({ contadores });

    let card = await sampleCardByRarity(raridade);
    if (!card) {
        card = await sampleCardByRarity('common');
    }
    if (!card) {
        return interaction.editReply({ embeds: [errorEmbed(t, 'roll.sem_cartas')] });
    }

    // A raridade define a ordem de grandeza do preço; o overall só move
    // dentro da faixa. Ver `utils/valores.js` para o porquê.
    const { marketValue, valueToSell } = valores.valoresDaCarta(card);

    const render = await renderCard(card, { moldura: molduraEfetiva(user) });

    const rarityMeta = ui.getRarity(card.rarity, t.locale);

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`enviarInventario_${card._id}_${interaction.user.id}`)
                .setLabel(t('roll.botao_guardar'))
                .setEmoji('🎴')
                .setStyle(ButtonStyle.Success)
        )
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`vender_${card._id}_${interaction.user.id}`)
                .setLabel(t('roll.botao_vender', { valor: ui.number(valueToSell, t.locale) }))
                .setEmoji('🪙')
                .setStyle(ButtonStyle.Secondary)
        );

    const embed = ui.base(rarityMeta.color)
        .setAuthor({
            name: t('roll.autor', { jogador: interaction.user.username }),
            iconURL: interaction.user.displayAvatarURL()
        })
        .setTitle(`${rarityMeta.emoji} ${ui.cardName(card)}`)
        .setDescription([
            `*${card.series}*`,
            '',
            ui.statLines(card, t.locale),
            '',
            t('roll.linha_raridade', {
                raridade: ui.rarityTag(card.rarity, t.locale),
                overall: card.overall
            })
        ].join('\n'))
        .addFields(
            { name: t('roll.valor_mercado'), value: ui.coins(marketValue, t.locale), inline: true },
            { name: t('roll.venda_rapida'), value: ui.coins(valueToSell, t.locale), inline: true }
        )
        .setImage(render.url);

    // Só avisa quando a proteção realmente disparou. Anunciar o contador
    // a cada roll transformaria a espera em contagem regressiva, e quem
    // está a 3 rolls da garantia pararia de rolar até chegar lá.
    if (garantida) {
        const rede = sorteio.PROTECOES.find((p) => p.raridade === garantida);
        embed.setFooter({
            text: `${ui.BRAND} • ${t('roll.protecao_azar', {
                rolls: contadores[rede.campo],
                raridade: ui.getRarity(garantida, t.locale).label
            })}`
        });
    }

    await interaction.editReply({ embeds: [embed], components: [row], files: [render.attachment] });

    // Marco para medir a latência do clique no botão. Fica DEPOIS do
    // editReply de propósito: medir a partir do início do comando somaria
    // o tempo de renderizar a carta no canvas, que varia de centenas de
    // milissegundos a segundos e afogaria o sinal.
    const mostradoEm = Date.now();

    if (!user) {
        user = new User({ id: interaction.user.id });
    }

    // Roll extra NÃO mexe no relógio: ele é recurso paralelo, e o roll
    // grátis continua chegando na hora de sempre. Atualizar `lastRoll`
    // aqui faria o extra custar o roll seguinte.
    //
    // Gastando uma carga, `lastRoll` avança UM cooldown em vez de ir para
    // agora: o tempo que sobra continua contando para a próxima. Sem isso,
    // quem tinha 3 cargas e usasse 1 perderia as outras 2.
    if (!usouExtra) {
        user.lastRoll = nivel.proximoLastRoll(Math.max(1, cargas), cooldownEfetivo, now);
    }

    // Pela raridade da carta ENTREGUE, não pela sorteada: quando o
    // catálogo não tem carta da raridade sorteada, o jogador recebe uma
    // Comum — e zerar aí faria ele perder a espera acumulada sem ter
    // recebido nada em troca.
    Object.assign(user, sorteio.proximosContadores(card.rarity, contadores));
    await user.save();

    // Avisa quem tem essa carta na lista de desejos. É só um aviso: quem
    // rolou continua com prioridade total sobre a carta. A ideia é gerar
    // conversa e movimentar o mercado, não criar disputa por clique.
    // O aviso é público e menciona quem deseja a carta — vai no idioma do
    // servidor, não no de quem rolou: quem lê são os outros.
    tDoUsuario(null, interaction.guildId)
        .then((tCanal) => avisarDesejantes(interaction, card, rarityMeta, tCanal))
        .catch(() => {});

    // Contadores, missões e conquistas.
    registrar(interaction.user.id, { rolls: 1 }, { eventosMissao: ['roll'] })
        .then((resultado) => notificarProgresso(interaction, resultado))
        .catch((err) => console.error('Erro ao registrar progresso do roll:', err));

    const previousCollector = activeCollectors.get(interaction.user.id);
    if (previousCollector) {
        previousCollector.stop();
    }

    const collector = rollCollect(interaction, card, user, marketValue, valueToSell, rollEnd, mostradoEm, t);
    activeCollectors.set(interaction.user.id, collector);
    collector.on('end', () => {
        if (activeCollectors.get(interaction.user.id) === collector) {
            activeCollectors.delete(interaction.user.id);
        }
    });
};

// O roll extra da /loja precisa saber o mesmo cooldown para calcular
// quanto de espera está sendo cortado. Exportar daqui mantém uma fonte
// só — reler o .env do outro lado manteria os dois iguais por disciplina,
// e disciplina é o que falha primeiro.
module.exports.ROLL_COOLDOWN_MS = ROLL_COOLDOWN_MS;
