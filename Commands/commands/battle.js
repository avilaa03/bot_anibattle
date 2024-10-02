const BaseSlashCommand = require("../utils/BaseSlashCommand");
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const User = require("../utils/userSchema");

module.exports = class BattleSlashCommand extends BaseSlashCommand {
    constructor() {
        super('battle');
    }

    async run(client, interaction) {
        const userX = interaction.user;
        const userY = interaction.options.getUser('user')

        if (!userY) {
            return interaction.reply({content: "Você precisa mencionar um usuário para desafiar!", ephemeral: true})
        }

        if (userY.bot) {
            return interaction.reply({ content: "Você não pode desafiar bots!", ephemeral: true})
        }

        if (userX.id === userY.id) {
            return interaction.reply({ content: "Você não pode desafiar a si mesmo!", ephemeral: true})
        }

        let userXData = await User.findOne({ id: userX.id})
        if (!userXData) {
            userXData = new User({id: userX.id})
            await userXData.save()
        }

        const challengeEmbed = new EmbedBuilder()
            .setTitle('Desafio para um AniBattle!')
            .setDescription(`${userX.username} desafiou ${userY.username} para uma batalha!`)
            .setColor('#FFA500')

        const acceptButton = new ButtonBuilder()
            .setCustomId('accept_battle')
            .setLabel('Aceitar Batalha')
            .setStyle(ButtonStyle.Success)

        const actionRow = new ActionRowBuilder().addComponents(acceptButton)

        const challengeMessage = await interaction.reply({
            content: `${userY}, você foi desafiado por ${userX}!`,
            embeds: [challengeEmbed],
            components: [actionRow],
            fetchReply: true
        })

        const filter = (i) => i.customId === 'accept_battle' && i.user.id === userY.id
        const collector = challengeMessage.createMessageComponentCollector({filter, time: 30000})

        collector.on('collect', async (i) => {
            await i.update({
                content: `${userY.username} aceitou o desafio! A batalha começou!`,
                components: []
            })

            interaction.followUp({content: 'Batalha iniciada!'})
        })

        collector.on('end', async (collected) => {
            if (collected.size === 0) {
                await interaction.editReply({
                    content: `${userY.username} não respondeu a tempo, batalha cancelada`,
                    components: []
                })
            }
        })
    }

    getSlashCommandJSON() {
        return new SlashCommandBuilder()
            .setName(this.name)
            .setDescription('Desafie outro usuário para uma batalha')
            .addUserOption(option =>
                option.setName('user')
                    .setDescription('O usuário que você deseja desafiar')
                    .setRequired(true)
            )
    }
}