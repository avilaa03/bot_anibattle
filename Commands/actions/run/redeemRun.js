const { MessageFlags } = require('discord.js');
const ui = require('../../utils/embeds');
const resgate = require('../../utils/redeem');
const rewards = require('../../utils/rewards');
const { tDaInteracao } = require('../../utils/language');

/**
 * /redeem — troca um código por tudo que ele carrega.
 *
 * ## Por que a resposta é sempre efêmera
 *
 * O código é um portador: quem lê o texto pode usá-lo. Uma resposta
 * pública mostraria o código digitado no canal para todo mundo — e num
 * código de campanha, com vários usos, o primeiro que passasse pelo canal
 * levaria os que sobraram.
 *
 * ## Limite de tentativas
 *
 * O espaço de códigos é grande o bastante para chute isolado não valer a
 * pena, mas nada nele impede um script de tentar a noite inteira. O limite
 * aqui não protege contra sorte: protege contra volume.
 *
 * Ele conta só as tentativas ERRADAS. Quem tem código de verdade — o
 * jogador que comprou três meses e resgata três códigos seguidos — não
 * pode ser barrado por usar o comando do jeito certo.
 */

const JANELA_MS = 10 * 60 * 1000;
const MAXIMO_ERROS = 8;

/** userId -> instantes das tentativas erradas recentes. */
const tentativas = new Map();

function errosRecentes(userId, agora = Date.now()) {
    const recentes = (tentativas.get(userId) || []).filter((t) => agora - t < JANELA_MS);
    if (recentes.length > 0) tentativas.set(userId, recentes);
    else tentativas.delete(userId);
    return recentes;
}

function registrarErro(userId) {
    const agora = Date.now();
    const recentes = errosRecentes(userId, agora);
    recentes.push(agora);
    tentativas.set(userId, recentes);

    // Faxina preguiçosa: sem isto o Map cresce para sempre num processo
    // que fica meses no ar.
    if (tentativas.size > 1000) {
        for (const [id, lista] of tentativas) {
            if (lista.every((t) => agora - t >= JANELA_MS)) tentativas.delete(id);
        }
    }
}

function limparErros(userId) {
    tentativas.delete(userId);
}

/** Motivo de recusa -> as duas chaves de texto que o jogador vê. */
const RECUSAS = {
    FORMATO: ['resgate.formato_titulo', 'resgate.formato_texto'],
    INVALIDO: ['resgate.invalido_titulo', 'resgate.invalido_texto'],
    EXPIRADO: ['resgate.expirado_titulo', 'resgate.expirado_texto'],
    ESGOTADO: ['resgate.esgotado_titulo', 'resgate.esgotado_texto'],
    JA_RESGATADO: ['resgate.ja_resgatado_titulo', 'resgate.ja_resgatado_texto'],
    ENTREGA_PENDENTE: ['resgate.pendente_titulo', 'resgate.pendente_texto'],
    FALHA_PARCIAL: ['resgate.parcial_titulo', 'resgate.parcial_texto']
};

module.exports = async (client, interaction) => {
    const t = await tDaInteracao(interaction);
    const userId = interaction.user.id;

    if (errosRecentes(userId).length >= MAXIMO_ERROS) {
        return interaction.reply({
            embeds: [ui.warning(t('resgate.muitas_tentativas'), t('resgate.muitas_tentativas_texto', {
                minutos: Math.round(JANELA_MS / 60000)
            }))],
            flags: MessageFlags.Ephemeral
        });
    }

    // O resgate escreve em vários lugares (saldo, bolsa, inventário,
    // assinatura) e pode passar dos 3 segundos que o Discord dá.
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    let resultado;
    try {
        resultado = await resgate.resgatar(userId, interaction.options.getString('code'));
    } catch (err) {
        console.error('Erro ao resgatar código:', err);
        return interaction.editReply({ embeds: [ui.error(t('comum.erro'), t('resgate.erro'))] });
    }

    if (!resultado.ok) {
        // Falha parcial não é chute errado: o código era bom e o bot é que
        // tropeçou. Contar como tentativa puniria o jogador por um bug seu.
        if (resultado.motivo !== 'FALHA_PARCIAL') registrarErro(userId);

        const [titulo, texto] = RECUSAS[resultado.motivo] || RECUSAS.INVALIDO;
        const embed = ui.warning(t(titulo), t(texto));

        // Numa falha parcial, dizer O QUE já entrou evita a pergunta mais
        // provável do suporte ("perdi tudo?") e deixa claro que o resto
        // não sumiu.
        if (resultado.motivo === 'FALHA_PARCIAL' && resultado.recompensas?.length > 0) {
            embed.addFields({
                name: t('resgate.ja_recebeu'),
                value: resultado.recompensas.map((r) => rewards.descrever(r, t.locale)).join('\n')
            });
        }
        return interaction.editReply({ embeds: [embed] });
    }

    limparErros(userId);

    const linhas = resultado.recompensas.map((r) => rewards.descrever(r, t.locale));

    // Carta inédita ganha uma linha própria: é a única recompensa cujo
    // valor depende do que o jogador já tinha, e a Pokédex é o motivo de
    // muita gente estar jogando.
    const ineditas = resultado.recompensas.filter((r) => r.detalhe?.inedita).length;

    const embed = ui.success(t('resgate.sucesso_titulo'), t('resgate.sucesso_texto'))
        .addFields({ name: t('resgate.voce_recebeu'), value: linhas.join('\n') });

    if (ineditas > 0) {
        embed.addFields({ name: t('resgate.pokedex'), value: t('resgate.pokedex_texto', { n: ineditas }) });
    }

    embed.setFooter({
        text: `${ui.BRAND} • ${resultado.restantes > 0
            ? t('resgate.rodape_restantes', { n: resultado.restantes })
            : t('resgate.rodape_usado')}`
    });

    return interaction.editReply({ embeds: [embed] });
};
