/**
 * O nome de cada comando, subcomando e opção — e o apelido por idioma.
 *
 * ## Por que existe um arquivo só para isto
 *
 * O nome CANÔNICO é inglês, e é ele que aparece no código, nos logs e na
 * documentação. Mas o Discord deixa cada idioma ter o seu apelido
 * (`setNameLocalizations`), e é isso que faz `/bolsa` continuar
 * funcionando para quem já joga: o canônico virou `bag`, e quem usa o
 * Discord em português continua digitando o que sempre digitou.
 *
 * Espalhar esses apelidos pelos 39 arquivos de comando garantiria que
 * alguém esquecesse um — e esquecer um apelido é quebrar o comando na
 * cara de quem já jogava, sem erro nenhum no log. Aqui é um lugar só, com
 * teste em cima.
 *
 * ## A regra que não pode ser quebrada
 *
 * **O apelido `pt-BR` tem que ser exatamente o nome antigo.** Ele não é
 * uma tradução nova: é compatibilidade. Trocar `bolsa` por `mochila`
 * aqui, mesmo sendo melhor português, quebraria a memória de quem já
 * joga — que é justamente o que este arquivo existe para evitar. Há teste
 * que confere isso contra a lista congelada em `tests/nomes.test.js`.
 *
 * O `es-ES` é livre: o espanhol nasceu depois do inglês e nunca teve nome
 * próprio, então não há memória a preservar.
 *
 * ## Limites do Discord
 *
 * Nome de comando é minúsculo, sem espaço, de 1 a 32 caracteres. Acento é
 * aceito pela API, mas os apelidos aqui são todos sem acento porque é o
 * que os nomes antigos já eram (`missoes`, `cosmeticos`) — e mudar a
 * grafia é mudar o nome.
 */

/** Comandos que tinham nome em português. Canônico -> apelidos. */
const COMANDOS = {
    upgrade: { 'pt-BR': 'aprimorar', 'es-ES': 'mejorar' },
    bag: { 'pt-BR': 'bolsa', 'es-ES': 'bolsa' },
    box: { 'pt-BR': 'caixa', 'es-ES': 'caja' },
    collectors: { 'pt-BR': 'colecionadores', 'es-ES': 'coleccionistas' },
    achievements: { 'pt-BR': 'conquistas', 'es-ES': 'logros' },
    cosmetics: { 'pt-BR': 'cosmeticos', 'es-ES': 'cosmeticos' },
    wish: { 'pt-BR': 'desejar', 'es-ES': 'desear' },
    wishlist: { 'pt-BR': 'desejos', 'es-ES': 'deseos' },
    salvage: { 'pt-BR': 'desmanchar', 'es-ES': 'desmontar' },
    event: { 'pt-BR': 'evento', 'es-ES': 'evento' },
    cardinfo: { 'pt-BR': 'ficha', 'es-ES': 'ficha' },
    language: { 'pt-BR': 'idioma', 'es-ES': 'idioma' },
    shop: { 'pt-BR': 'loja', 'es-ES': 'tienda' },
    tycoon: { 'pt-BR': 'magnata', 'es-ES': 'magnate' },
    missions: { 'pt-BR': 'missoes', 'es-ES': 'misiones' },
    tournament: { 'pt-BR': 'torneio', 'es-ES': 'torneo' },
    training: { 'pt-BR': 'treino', 'es-ES': 'entrenamiento' },
    trade: { 'pt-BR': 'trocar', 'es-ES': 'intercambiar' }
};

/**
 * Subcomandos que tinham nome em português.
 *
 * A chave é `<comando>.<subcomando>` porque `buy` existe no `/shop` e no
 * `/box`, e nada garante que os dois queiram o mesmo apelido para sempre.
 */
const SUBCOMANDOS = {
    'shop.view': { 'pt-BR': 'ver', 'es-ES': 'ver' },
    'shop.buy': { 'pt-BR': 'comprar', 'es-ES': 'comprar' },
    'shop.extra-roll': { 'pt-BR': 'roll-extra', 'es-ES': 'tirada-extra' },
    'box.view': { 'pt-BR': 'ver', 'es-ES': 'ver' },
    'box.buy': { 'pt-BR': 'comprar', 'es-ES': 'comprar' },
    'box.open': { 'pt-BR': 'abrir', 'es-ES': 'abrir' },
    'event.list': { 'pt-BR': 'lista', 'es-ES': 'lista' },
    'event.join': { 'pt-BR': 'entrar', 'es-ES': 'entrar' }
};

/**
 * Opções que tinham nome em português.
 *
 * A chave é só o nome canônico: a mesma opção quer o mesmo apelido em
 * qualquer comando, e ter `name` significando "nome" em todos eles é
 * justamente o que deixa a interface previsível.
 */
const OPCOES = {
    name: { 'pt-BR': 'nome', 'es-ES': 'nombre' },
    amount: { 'pt-BR': 'quantidade', 'es-ES': 'cantidad' },
    box: { 'pt-BR': 'caixa', 'es-ES': 'caja' },
    series: { 'pt-BR': 'serie', 'es-ES': 'serie' },
    rarity: { 'pt-BR': 'raridade', 'es-ES': 'rareza' },
    scope: { 'pt-BR': 'escopo', 'es-ES': 'ambito' },
    language: { 'pt-BR': 'idioma', 'es-ES': 'idioma' },
    difficulty: { 'pt-BR': 'dificuldade', 'es-ES': 'dificultad' },
    wager: { 'pt-BR': 'aposta', 'es-ES': 'apuesta' },
    slots: { 'pt-BR': 'vagas', 'es-ES': 'plazas' },
    fee: { 'pt-BR': 'inscricao', 'es-ES': 'inscripcion' },
    number: { 'pt-BR': 'numero', 'es-ES': 'numero' },
    remove: { 'pt-BR': 'remover', 'es-ES': 'quitar' },
    missing: { 'pt-BR': 'faltantes', 'es-ES': 'faltantes' }
};

/**
 * Os apelidos de um nome, prontos para `setNameLocalizations()`.
 *
 * Devolve `{}` para nome que nunca teve versão em português (`/roll`,
 * `/market`, `/daily`...). Objeto vazio é o que o Discord espera para
 * "sem apelido", então quem chama não precisa testar antes.
 *
 * @param {object} mapa   COMANDOS, SUBCOMANDOS ou OPCOES
 * @param {string} chave  o nome canônico
 */
function apelidos(mapa, chave) {
    return mapa[chave] ? { ...mapa[chave] } : {};
}

/** Apelidos de um comando: `nomesDeComando.comando('bag')`. */
function comando(canonico) {
    return apelidos(COMANDOS, canonico);
}

/** Apelidos de um subcomando: `nomesDeComando.subcomando('shop', 'buy')`. */
function subcomando(comandoCanonico, subCanonico) {
    return apelidos(SUBCOMANDOS, `${comandoCanonico}.${subCanonico}`);
}

/** Apelidos de uma opção: `nomesDeComando.opcao('name')`. */
function opcao(canonico) {
    return apelidos(OPCOES, canonico);
}

/**
 * O nome que um jogador daquele idioma vê e digita.
 *
 * É o que os textos do bot e o site precisam citar: mandar quem usa o
 * Discord em português digitar `/bag` seria mandá-lo digitar um comando
 * que, para ele, não existe.
 */
function nomeNoIdioma(canonico, locale) {
    return COMANDOS[canonico]?.[locale] ?? canonico;
}

module.exports = {
    COMANDOS,
    SUBCOMANDOS,
    OPCOES,
    comando,
    subcomando,
    opcao,
    nomeNoIdioma
};
