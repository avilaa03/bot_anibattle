const { EmbedBuilder } = require('discord.js');

async function helpRun(client, interaction) {
            
    const embed = new EmbedBuilder()
    .setTitle('Comandos do AniBattle')
    .addFields(
      { name: "/roll", value: "Rolar uma carta aleatória (cooldown: 15 min). Você pode enviar ao inventário ou vender. Raridades: common, rare, ultra rare, legendary, master." },
      { name: "/show", value: "Mostrar uma carta do inventário pelo nome (com paginação)." },
      { name: "/inventory", value: "Listar todas as cartas do seu inventário." },
      { name: "/battle", value: "Desafiar outro usuário para uma batalha 3v3. Escolha 3 cartas no privado; ATA, LIF e POW definem o combate." },
      { name: "/ranking", value: "Top 10 por vitórias em batalhas ou por moedas. Use o parâmetro para escolher o tipo." },
      { name: "/favcard", value: "Definir uma carta como favorita (aparece no perfil)." },
      { name: "/profile", value: "Ver seu perfil no AniBattle." },
      { name: "/sell", value: "Anunciar uma carta no mercado." },
      { name: "/undosell", value: "Remover anúncio do mercado." },
      { name: "/market", value: "Comprar ou procurar cartas no mercado." },
      { name: "/mymarket", value: "Ver suas cartas anunciadas no mercado." },
      { name: "/quicksell", value: "Venda rápida de uma carta pelo nome." },
      { name: "/balance", value: "Ver suas moedas ou as de outro usuário." },
      { name: "/daily", value: "Resgatar recompensa diária." },
      { name: "/give", value: "Enviar moedas para outro usuário." },
      { name: "/info", value: "Informações do bot." },
      { name: "/ping", value: "Testar latência." },
      { name: "/dice", value: "Rolar um dado (1 a 6)." }
    )

  interaction.reply({ embeds: [embed] });

}

module.exports = helpRun