const User = require('../../utils/userSchema');
const CardBuilder = require('../../utils/cardBuilder.js');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const ui = require('../../utils/embeds');
const { molduraEfetiva } = require('../../utils/vip');

// Coletores ativos por usuário (ver rollRun.js para o motivo de não usar
// mais uma única variável de módulo compartilhada entre todos os usuários).
const activeCollectors = new Map();

module.exports = async (client, interaction, favCardCollect, favCardEnd) => {
    const name = interaction.options.getString('name').toLowerCase();
    const user = await User.findOne({ id: interaction.user.id });

    if (!user || user.inventory.length === 0) {
        const embed = ui.neutral('📋 Inventário vazio', 'Você ainda não tem cartas. Use `/roll` para ganhar a primeira!');
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const matchingCards = user.inventory.filter(c => c.name.toLowerCase().includes(name));

    if (matchingCards.length === 0) {
        const embed = ui.error('Carta não encontrada', `Nenhuma carta no seu inventário tem "${name}" no nome.`);
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    await interaction.deferReply();

    let currentIndex = 0;

    const updateEmbed = async (index) => {
        const card = matchingCards[index];
        const cardBuilder = new CardBuilder(card, { moldura: molduraEfetiva(user) });
        const cardImageBuffer = await cardBuilder.build();
        const attachment = new AttachmentBuilder(cardImageBuffer, { name: 'cardImage.png' });

        const meta = ui.getRarity(card.rarity);
        const embed = ui.base(meta.color)
            .setTitle(`${meta.emoji} ${ui.cardName(card.name)}`)
            .setDescription([
                `*${card.series || '—'}*`,
                '',
                ui.statLines(card),
                '',
                `Raridade ${ui.rarityTag(card.rarity)} • Overall **${card.overall ?? 0}**`,
                '',
                'Clique em **Favoritar** para deixar esta carta no seu perfil.'
            ].join('\n'))
            .setImage('attachment://cardImage.png')
            .setFooter({ text: `${ui.BRAND} • Carta ${index + 1} de ${matchingCards.length}` });
        return { embed, attachment };
    };

    const createRow = () => {
        return new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('prev')
                    .setLabel('Anterior')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(matchingCards.length === 1),
                new ButtonBuilder()
                    .setCustomId('next')
                    .setLabel('Próximo')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(matchingCards.length === 1),
                new ButtonBuilder()
                    .setCustomId('fav')
                    .setLabel('Favoritar')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('cancel')
                    .setLabel('Cancelar')
                    .setStyle(ButtonStyle.Danger)
            );
    };

    const previousCollector = activeCollectors.get(interaction.user.id);
    if (previousCollector) {
        previousCollector.stop();
    }

    const { embed, attachment } = await updateEmbed(0);
    const message = await interaction.editReply({ embeds: [embed], components: [createRow()], files: [attachment] });

    const collector = favCardCollect(interaction, message, { currentIndex }, matchingCards, user, favCardEnd, updateEmbed, createRow);
    activeCollectors.set(interaction.user.id, collector);
    collector.on('end', () => {
        if (activeCollectors.get(interaction.user.id) === collector) {
            activeCollectors.delete(interaction.user.id);
        }
    });
};
