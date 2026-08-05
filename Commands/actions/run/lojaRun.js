const { MessageFlags } = require('discord.js');
const User = require('../../utils/userSchema');
const ui = require('../../utils/embeds');
const itens = require('../../utils/itens');
const bolsa = require('../../utils/bolsa');
const { trySpend, addBalance } = require('../../utils/economy');

/**
 * /loja — troca moeda por item.
 *
 * ## Para que ela existe
 *
 * Não é para dar poder a quem tem dinheiro: é para **tirar moeda de
 * circulação**. Hoje o único sink do jogo é a taxa de 5% do mercado,
 * enquanto `/daily`, missões, batalhas e venda rápida criam moeda todo
 * dia. Sem sink, tudo que entra fica para sempre e o mercado perde o
 * sentido — ver o cabeçalho de `utils/economy.js`.
 *
 * Por isso o carro-chefe é a gema, que é consumível: ela some ao ser
 * usada. Uma moldura se compra uma vez e nunca mais.
 */

// Teto por compra. Não é regra de jogo, é guarda contra o dedo escorregar
// num zero a mais e contra número absurdo virar total absurdo.
const MAXIMO_POR_COMPRA = 1000;

function embedDaLoja(user) {
    const saldo = Number(user?.balance) || 0;

    const embed = ui.base()
        .setTitle('🏪 Loja')
        .setDescription([
            'Compre com `/loja comprar`.',
            '',
            `Seu saldo: **${ui.coins(saldo)}**`
        ].join('\n'));

    for (const item of itens.itensDaLoja()) {
        const tem = bolsa.quantidadeDe(user, item.chave);
        embed.addFields({
            name: `${item.emoji} ${item.nome} — ${ui.coins(item.preco)}`,
            value: [
                item.descricao,
                item.detalhe ? `> *${item.detalhe}*` : null,
                tem > 0 ? `> Você tem **${ui.number(tem)}**.` : null
            ].filter(Boolean).join('\n')
        });
    }

    embed.setFooter({ text: `${ui.BRAND} • A moeda gasta aqui sai de circulação` });
    return embed;
}

async function comprar(interaction) {
    const chave = interaction.options.getString('item');
    const quantidade = interaction.options.getInteger('quantidade') ?? 1;

    const item = itens.getItem(chave);
    if (!item || item.preco == null) {
        return interaction.reply({
            embeds: [ui.error('Item indisponível', 'Esse item não está à venda.')],
            flags: MessageFlags.Ephemeral
        });
    }

    if (quantidade < 1 || quantidade > MAXIMO_POR_COMPRA) {
        return interaction.reply({
            embeds: [ui.error('Quantidade inválida', `Compre de 1 a ${ui.number(MAXIMO_POR_COMPRA)} por vez.`)],
            flags: MessageFlags.Ephemeral
        });
    }

    const total = item.preco * quantidade;

    // Debita PRIMEIRO, e de forma atômica: é o banco que decide se há
    // saldo, no mesmo instante da escrita. Ler o saldo antes e conferir
    // aqui deixaria uma janela entre a leitura e a gravação — dois
    // comandos disparados junto passariam os dois pela conferência e o
    // jogador compraria mais do que tem.
    const debitado = await trySpend(interaction.user.id, total);
    if (!debitado) {
        const user = await User.findOne({ id: interaction.user.id }).lean();
        const saldo = Number(user?.balance) || 0;
        return interaction.reply({
            embeds: [ui.warning('Saldo insuficiente', [
                `${item.emoji} **${item.nome}** x${ui.number(quantidade)} custa ${ui.coins(total)}.`,
                `Você tem ${ui.coins(saldo)} — faltam **${ui.coins(total - saldo)}**.`
            ].join('\n'))],
            flags: MessageFlags.Ephemeral
        });
    }

    // A partir daqui a moeda já saiu. Se a entrega falhar, ela PRECISA
    // voltar: cobrar sem entregar é o único erro desta tela que o jogador
    // não tem como contornar sozinho.
    let quantidadeFinal;
    try {
        quantidadeFinal = await bolsa.adicionar(interaction.user.id, item.chave, quantidade);
    } catch (err) {
        await addBalance(interaction.user.id, total).catch(() => {});
        throw err;
    }

    const embed = ui.success('Compra concluída', [
        `${item.emoji} **${item.nome}** x${ui.number(quantidade)}`,
        '',
        `Pagou ${ui.coins(total)} • Saldo: ${ui.coins(debitado.balance)}`,
        `Na bolsa agora: **${ui.number(quantidadeFinal)}**`
    ].join('\n'));

    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

module.exports = async (client, interaction) => {
    if (interaction.options.getSubcommand(false) === 'comprar') {
        return comprar(interaction);
    }

    const user = await User.findOne({ id: interaction.user.id }).lean();
    return interaction.reply({ embeds: [embedDaLoja(user)], flags: MessageFlags.Ephemeral });
};
