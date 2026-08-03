const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const Card = require('../../utils/cardSchema');
const User = require('../../utils/userSchema');
const ui = require('../../utils/embeds');
const { escapeRegex } = require('../../utils/regexUtils');
const { formatarNumero } = require('../../utils/dexNumbers');
const wishlist = require('../../utils/wishlist');

/**
 * /desejar — adiciona ou remove uma carta da lista de desejos.
 *
 * Diferente da Pokédex, aqui o jogador pode desejar carta que nunca teve
 * — é justamente esse o ponto: marcar o que você está caçando.
 */
async function desejarRun(client, interaction) {
    const nome = (interaction.options.getString('nome') || '').trim();
    const numero = interaction.options.getInteger('numero');
    const remover = interaction.options.getBoolean('remover') || false;

    if (!nome && numero == null) {
        return interaction.reply({
            embeds: [ui.error('Informe o que procurar', 'Use `/desejar nome:Gojo` ou `/desejar numero:42`.')],
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
            embeds: [ui.error('Carta não encontrada', numero != null
                ? `Não existe carta com o número ${formatarNumero(numero, totalCatalogo)}.`
                : `Nenhuma carta no catálogo tem "${nome}" no nome.`)]
        });
    }

    // Mais de um resultado: pede para escolher.
    if (encontradas.length > 1) {
        const lista = encontradas.map((c) => {
            const meta = ui.getRarity(c.rarity);
            return `${formatarNumero(c.numero, totalCatalogo)} ${meta.emoji} **${ui.cardName(c.name)}** — *${c.series}*`;
        }).join('\n');

        return interaction.editReply({
            embeds: [ui.neutral('Várias cartas encontradas', `${lista}\n\nUse \`/desejar numero:<número>\` para escolher uma.`)]
        });
    }

    const carta = encontradas[0];
    const meta = ui.getRarity(carta.rarity);
    const user = await User.findOne({ id: interaction.user.id }).lean();

    // ---- Remover ----
    if (remover) {
        const removeu = await wishlist.remover(interaction.user.id, carta._id);
        return interaction.editReply({
            embeds: [removeu
                ? ui.success('Removida dos desejos', `${meta.emoji} **${ui.cardName(carta.name)}** saiu da sua lista.`)
                : ui.neutral('Não estava na lista', `${meta.emoji} **${ui.cardName(carta.name)}** não estava nos seus desejos.`)]
        });
    }

    // ---- Adicionar ----
    const resultado = await wishlist.adicionar(interaction.user.id, carta._id);

    if (!resultado.ok) {
        if (resultado.motivo === 'JA_TEM') {
            return interaction.editReply({
                embeds: [ui.neutral('Já está na lista', `${meta.emoji} **${ui.cardName(carta.name)}** já está nos seus desejos.\n\nUse \`/desejar nome:${carta.name} remover:True\` para tirar.`)]
            });
        }
        if (resultado.motivo === 'LIMITE') {
            return interaction.editReply({
                embeds: [ui.warning('Lista cheia', `Você já tem **${resultado.total}** cartas desejadas (limite ${resultado.limite}).\n\nRemova alguma com \`remover:True\`, ou assine um plano em \`/vip\` para aumentar o limite.`)]
            });
        }
        return interaction.editReply({
            embeds: [ui.error('Perfil não encontrado', 'Use `/roll` ou `/daily` para criar seu perfil primeiro.')]
        });
    }

    const jaTem = (user?.discovered || []).some((d) => String(d.cardId) === String(carta._id));
    const quantosDesejam = await wishlist.contarDesejos(carta._id);

    const embed = ui.success('Adicionada aos desejos', `${meta.emoji} **${ui.cardName(carta.name)}** — *${carta.series}*`)
        .addFields(
            { name: 'Número', value: formatarNumero(carta.numero, totalCatalogo), inline: true },
            { name: 'Sua lista', value: `${resultado.total} / ${resultado.limite}`, inline: true },
            { name: 'Também procuram', value: `${quantosDesejam} jogador(es)`, inline: true }
        )
        .addFields({
            name: 'O que isso faz',
            value: 'Quando alguém rolar esta carta, você é avisado e pode propor uma troca ou uma compra.\n'
                + '⚠️ Desejar **não** disputa a carta: ela fica com quem rolou.',
            inline: false
        })
        .setFooter({ text: `${ui.BRAND} • O aviso é só para você saber com quem negociar` });

    if (jaTem) {
        embed.setDescription(`${embed.data.description}\n\n💡 *Você já registrou essa carta na Pokédex — talvez queira caçar outra.*`);
    }

    return interaction.editReply({ embeds: [embed] });
}

module.exports = desejarRun;
