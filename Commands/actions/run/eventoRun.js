const { MessageFlags } = require('discord.js');
const Evento = require('../../utils/eventoSchema');
const ui = require('../../utils/embeds');
const itens = require('../../utils/itens');
const { tDaInteracao } = require('../../utils/idioma');

/**
 * /evento — ver e entrar nos eventos abertos.
 *
 * O jogador só faz duas coisas aqui: olhar e entrar. Quem paga o prêmio
 * é o painel administrativo — ver `eventoSchema.js` para o porquê.
 */

/** Descreve o prêmio numa linha só, para caber na lista. */
function resumirPremio(premios, t) {
    const partes = [];

    if (premios?.moedas > 0) partes.push(ui.coins(premios.moedas, t.locale));

    // O nome da carta vem do próprio prêmio, não do dicionário: é nome
    // próprio, e o admin cadastrou exatamente aquele.
    for (const carta of premios?.cartas || []) {
        partes.push(`🃏 ${carta.nome}${carta.quantidade > 1 ? ` ×${carta.quantidade}` : ''}`);
    }

    // `itens` é um Map no Mongoose e um objeto comum no `.lean()`.
    // Normalizar aqui evita o `.entries is not a function` que só
    // apareceria quando alguém trocasse o lean por um findOne normal.
    const mapa = premios?.itens instanceof Map
        ? Object.fromEntries(premios.itens)
        : (premios?.itens || {});

    for (const [chave, quantidade] of Object.entries(mapa)) {
        if (!quantidade) continue;
        const item = itens.localizarPorChave(chave, t.locale);
        partes.push(`${item?.emoji || '📦'} ${item?.nome || chave} ×${quantidade}`);
    }

    return partes.length > 0 ? partes.join(' · ') : t('evento.sem_premio');
}

async function listar(interaction, t) {
    const abertos = await Evento.find({ tipo: 'inscricao', status: 'aberto' })
        .sort({ criadoEm: -1 })
        .limit(10)
        .lean();

    if (abertos.length === 0) {
        const embed = ui.info(t('evento.nenhum_aberto'), [
            t('evento.nenhum_aberto_texto'),
            '',
            t('evento.nenhum_aberto_dica')
        ].join('\n'));
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    const jaEstou = (evento) => (evento.participantes || []).some((p) => p.userId === interaction.user.id);

    const embed = ui.base()
        .setTitle(t('evento.abertos'))
        .setDescription(t('evento.como_entrar'))
        .addFields(abertos.map((evento) => ({
            name: `${jaEstou(evento) ? '✅' : '▫️'} ${evento.nome}`,
            value: [
                evento.descricao || `_${t('evento.sem_descricao')}_`,
                t('evento.premio', { premio: resumirPremio(evento.premios, t) }),
                t('evento.inscritos', { n: ui.number((evento.participantes || []).length, t.locale) }),
                jaEstou(evento) ? `_${t('evento.ja_inscrito_linha')}_` : ''
            ].filter(Boolean).join('\n').slice(0, 1024)
        })));

    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

async function entrar(interaction, t) {
    const nome = interaction.options.getString('nome', true);

    const evento = await Evento.findOne({
        tipo: 'inscricao',
        status: 'aberto',
        // Escapa o que o jogador digitou: sem isso um nome com `(` ou `[`
        // quebraria a consulta, e um `.*` viraria "entra em qualquer um".
        nome: new RegExp(`^${nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
    });

    if (!evento) {
        const embed = ui.error(
            t('evento.nao_encontrado'),
            t('evento.nao_encontrado_texto', { nome })
        );
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    // A inscrição é uma escrita só, com a condição no filtro: se o
    // jogador já estiver na lista, o documento não casa e nada acontece.
    // Ler-e-depois-escrever deixaria a janela para dois cliques rápidos
    // inscreverem a mesma pessoa duas vezes — e o painel pagaria dobrado.
    const r = await Evento.updateOne(
        {
            _id: evento._id,
            status: 'aberto',
            'participantes.userId': { $ne: interaction.user.id }
        },
        {
            $push: {
                participantes: {
                    userId: interaction.user.id,
                    entrouEm: new Date(),
                    premiado: false,
                    premiadoEm: null
                }
            }
        }
    );

    if (r.modifiedCount === 0) {
        const embed = ui.info(t('evento.ja_inscrito'), [
            t('evento.ja_inscrito_texto', { evento: evento.nome }),
            '',
            t('evento.entrega_depois')
        ].join('\n'));
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    const embed = ui.success(t('evento.confirmada'), [
        t('evento.confirmada_texto', { evento: evento.nome }),
        '',
        t('evento.premio', { premio: resumirPremio(evento.premios, t) }),
        '',
        t('evento.entrega_quando_apurar')
    ].join('\n'));

    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

module.exports = async (client, interaction) => {
    const t = await tDaInteracao(interaction);
    const sub = interaction.options.getSubcommand();
    if (sub === 'entrar') return entrar(interaction, t);
    return listar(interaction, t);
};
