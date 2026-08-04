const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { showCollect } = require('../collect/showCollect.js');
const User = require('../../utils/userSchema.js');
const { showEnd } = require('../end/showEnd.js');
const { renderCard } = require('../../utils/cardRenderer.js');
const ui = require('../../utils/embeds.js');
const valores = require('../../utils/valores.js');
const { molduraEfetiva } = require('../../utils/vip.js');
const { registrar } = require('../../utils/progresso.js');

async function showRun(client, interaction) {
    const name = interaction.options.getString('name').toLowerCase();

    const user = await User.findOne({ id: interaction.user.id });

    if (!user || user.inventory.length === 0) {
        const embed = ui.neutral('📋 Inventário vazio', 'Você ainda não tem cartas. Use `/roll` para ganhar a primeira!');
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    const matchingCards = user.inventory.filter(c => c.name.toLowerCase().includes(name));

    if (matchingCards.length === 0) {
        const embed = ui.error('Carta não encontrada', `Nenhuma carta no seu inventário tem "${name}" no nome.`);
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply();

    let currentIndex = 0;
    const indexRef = { currentIndex };

    const moldura = molduraEfetiva(user);
    // Molduras animadas geram .gif, as demais .png — o embed precisa citar
    // o nome certo do anexo, senão a imagem não aparece.
    let ultimoArquivo = 'cardImage.png';

    const updateEmbed = async (index, cards, includeImage = false) => {
        const card = cards[index];
        const meta = ui.getRarity(card.rarity);

        const embed = ui.base(meta.color)
            .setAuthor({ name: `Coleção de ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL() })
            .setTitle(`${meta.emoji} ${ui.cardName(card.name)}`)
            .setDescription([
                `*${card.series || '—'}*`,
                '',
                ui.statLines(card),
                '',
                `Raridade ${ui.rarityTag(card.rarity)} • Overall **${card.overall ?? 0}**`
            ].join('\n'))
            .addFields(
                { name: 'Valor de mercado', value: ui.coins(card.marketValue || 0), inline: true },
                { name: 'Venda rápida', value: ui.coins(card.valueToSell ?? valores.valoresDaCarta(card).valueToSell), inline: true }
            )
            .setFooter({ text: `${ui.BRAND} • Carta ${index + 1} de ${cards.length}` });

        if (includeImage) {
            const render = await renderCard(card, { moldura });
            ultimoArquivo = render.filename;
            embed.setImage(render.url);
            return { embed, attachment: render.attachment };
        }

        // Sem imagem nova: o embed continua apontando para o anexo que já
        // está na mensagem, então precisa manter o mesmo nome de arquivo.
        embed.setImage(`attachment://${ultimoArquivo}`);
        return { embed };
    };

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('prev')
                .setEmoji('◀️')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(matchingCards.length === 1),
            new ButtonBuilder()
                .setCustomId('next')
                .setEmoji('▶️')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(matchingCards.length === 1)
        );

    registrar(interaction.user.id, {}, { eventosMissao: ['consulta'], checarConquistas: false }).catch(() => {});

    const { embed, attachment } = await updateEmbed(indexRef.currentIndex, matchingCards, true);
    const message = await interaction.editReply({ embeds: [embed], components: [row], files: [attachment] });
    
    const filter = i => i.user.id === interaction.user.id;
    const collector = message.createMessageComponentCollector({ filter, time: 60000 });

    await showCollect(interaction, collector, matchingCards, indexRef, updateEmbed, row);
    showEnd(message);
}

module.exports = showRun;
