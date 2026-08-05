const valores = require('./valores');
const sorteio = require('./sorteio');

/**
 * Roll extra: adianta o próximo `/roll`.
 *
 * ## A ideia mais natural e a mais perigosa
 *
 * Vender roll converte moeda em carta, e carta em moeda. Sem trava, isso
 * fecha uma alça: o jogador rico rola mais, tira carta boa, vende, e rola
 * ainda mais — a economia deixa de depender de tempo e passa a depender de
 * saldo.
 *
 * Duas coisas seguram, e as duas são necessárias:
 *
 * 1. **Limite diário rígido.** Ele é o teto absoluto: por mais rico que o
 *    jogador seja, existe um número de rolls por dia que ele não passa.
 * 2. **Preço muito acima do que um roll rende.** Sem isso, o limite só
 *    atrasaria a alça em vez de fechá-la.
 *
 * ## O preço NASCE do valor esperado de um roll
 *
 * Mesmo desenho de `caixas.js`, pelo mesmo motivo: `VALOR_MULTIPLICADOR`
 * escala o valor das cartas e não escalaria um preço fixo. Subir o
 * multiplicador para calibrar a economia deixaria o roll extra barato em
 * relação ao que ele entrega — e a alça abriria sozinha, sem ninguém
 * tocar neste arquivo.
 *
 * ## Por que o preço escala DENTRO do dia
 *
 * O primeiro roll extra do dia é conveniência: quem perdeu a janela da
 * manhã compra e segue. O terceiro é outra coisa — é alguém tentando
 * transformar saldo em cartas. Cobrar o mesmo pelos dois trataria os dois
 * casos como iguais, e o segundo é o que precisa doer.
 */

/**
 * Quanto cada compra do dia custa, como múltiplo do valor esperado de um
 * roll. O comprimento da lista É o limite diário — assim os dois nunca
 * saem de sincronia.
 */
const MULTIPLICADORES = [7, 20, 54];

const ARREDONDAMENTO = 500;

/** Quantos por dia. Derivado, nunca escrito à parte. */
const LIMITE_DIARIO = MULTIPLICADORES.length;

/** Chave do contador em `limiteDiario`. */
const GRUPO = 'rollExtra';
const CHAVE = 'padrao';

/**
 * Onde o roll extra fica guardado na bolsa.
 *
 * ## Comprar e usar são atos separados
 *
 * A primeira versão adiantava o roll na hora da compra, e por isso só
 * deixava comprar durante o cooldown — fora dele a compra não teria
 * efeito. Isso tornava impossível estocar para a noite, que é justamente
 * quando quem trabalha usa o bot.
 *
 * Agora o roll extra é um item: compra quando tem dinheiro, usa quando tem
 * tempo. Mesmo desenho das caixas.
 *
 * A trava econômica continua no mesmo lugar — o LIMITE DIÁRIO é de
 * COMPRA. Estocar 3 por dia durante dez dias e gastar 30 numa tarde não
 * cria nenhuma carta a mais do que comprar e usar na hora; só muda quando.
 */
const CHAVE_BOLSA = 'roll_extra';

/**
 * Quanto vale, em média, o que sai de um `/roll`.
 *
 * Usa a tabela real do `sorteio.js`, então mexer nas chances de raridade
 * reprecifica o roll extra sozinho.
 *
 * A referência é o valor de MERCADO: o jogador revende ao preço cheio para
 * outro jogador, então é esse o teto do que ele extrai.
 */
function valorEsperadoDoRoll(ovr = 70) {
    return sorteio.tabelaDeChances().reduce(
        (total, faixa) => total + (faixa.chance / 100) * valores.valorDeMercado(faixa.raridade, ovr),
        0
    );
}

/** Os preços do dia, do primeiro ao último. */
function precos() {
    const ev = valorEsperadoDoRoll();
    return MULTIPLICADORES.map(
        (m) => Math.ceil((ev * m) / ARREDONDAMENTO) * ARREDONDAMENTO
    );
}

/**
 * Quanto custa a próxima compra.
 * @returns {number|null} null quando o limite do dia acabou
 */
function precoDoProximo(usadosHoje = 0) {
    const n = Math.max(0, Math.floor(Number(usadosHoje) || 0));
    return precos()[n] ?? null;
}

/** Quantos ainda cabem hoje. */
function restante(usadosHoje = 0) {
    return Math.max(0, LIMITE_DIARIO - Math.max(0, Math.floor(Number(usadosHoje) || 0)));
}

module.exports = {
    MULTIPLICADORES,
    ARREDONDAMENTO,
    LIMITE_DIARIO,
    GRUPO,
    CHAVE,
    CHAVE_BOLSA,
    valorEsperadoDoRoll,
    precos,
    precoDoProximo,
    restante
};
