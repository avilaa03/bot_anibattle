const { MessageFlags } = require('discord.js');
const Evento = require('../../utils/eventoSchema');
const ui = require('../../utils/embeds');
const itens = require('../../utils/itens');

/**
 * /evento — ver e entrar nos eventos abertos.
 *
 * O jogador só faz duas coisas aqui: olhar e entrar. Quem paga o prêmio
 * é o painel administrativo — ver `eventoSchema.js` para o porquê.
 */

/** Descreve o prêmio numa linha só, para caber na lista. */
function resumirPremio(premios) {
    const partes = [];

    if (premios?.moedas > 0) partes.push(ui.coins(premios.moedas));

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
        const item = itens.getItem(chave);
        partes.push(`${item?.emoji || '📦'} ${item?.nome || chave} ×${quantidade}`);
    }

    return partes.length > 0 ? partes.join(' · ') : 'sem prêmio definido';
}

async function listar(interaction) {
    const abertos = await Evento.find({ tipo: 'inscricao', status: 'aberto' })
        .sort({ criadoEm: -1 })
        .limit(10)
        .lean();

    if (abertos.length === 0) {
        const embed = ui.info('🎪 Nenhum evento aberto', [
            'Não há evento com inscrição aberta agora.',
            '',
            'Fique de olho no servidor — quando abrir um, ele aparece aqui e você entra com',
            '`/evento entrar`.'
        ].join('\n'));
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    const jaEstou = (evento) => (evento.participantes || []).some((p) => p.userId === interaction.user.id);

    const embed = ui.base()
        .setTitle('🎪 Eventos abertos')
        .setDescription('Entre com `/evento entrar nome:<o nome do evento>`.')
        .addFields(abertos.map((evento) => ({
            name: `${jaEstou(evento) ? '✅' : '▫️'} ${evento.nome}`,
            value: [
                evento.descricao || '_sem descrição_',
                `**Prêmio:** ${resumirPremio(evento.premios)}`,
                `**Inscritos:** ${ui.number((evento.participantes || []).length)}`,
                jaEstou(evento) ? '_Você já está inscrito._' : ''
            ].filter(Boolean).join('\n').slice(0, 1024)
        })));

    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

async function entrar(interaction) {
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
            'Evento não encontrado',
            `Não achei nenhum evento aberto chamado **${nome}**.\n\nUse \`/evento lista\` para ver os que estão abertos.`
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
        const embed = ui.info('Você já está inscrito', [
            `Sua inscrição em **${evento.nome}** já estava confirmada.`,
            '',
            'O prêmio é entregue quando o evento for apurado — não precisa fazer mais nada.'
        ].join('\n'));
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    const embed = ui.success('🎪 Inscrição confirmada!', [
        `Você entrou em **${evento.nome}**.`,
        '',
        `**Prêmio:** ${resumirPremio(evento.premios)}`,
        '',
        'A entrega acontece quando o evento for apurado. Fique de olho no servidor.'
    ].join('\n'));

    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

module.exports = async (client, interaction) => {
    const sub = interaction.options.getSubcommand();
    if (sub === 'entrar') return entrar(interaction);
    return listar(interaction);
};
