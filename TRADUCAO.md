# Como o bot fala dois idiomas

Português e inglês. Este documento é a referência de quem for mexer nisso.

## Estado atual

O inglês está **completo**: todo texto que chega ao jogador sai do
dicionário. Não há mais arquivo com frase escrita na mão.

| | |
|---|---|
| Dicionários | `Commands/locales/pt-BR.json` e `en-US.json` |
| Comandos localizados | 39 de 39 (descrição, opções e escolhas) |
| Conferência | `npm test` |

O espanhol **não existe** e é o próximo passo — ver o final deste
documento.

## O essencial

- Os códigos são `pt-BR` e `en-US` porque **a API do Discord exige** esses
  exatos. O site usa `pt`/`en`/`es` — a divergência é proposital.
- Nenhum comando escreve texto na mão: tudo sai de
  `Commands/locales/<idioma>.json` por `t('chave.pontilhada')`.

## Traduzir um comando

```js
const { tDaInteracao } = require('../../utils/idioma');

module.exports = async (client, interaction) => {
    const t = await tDaInteracao(interaction);
    // ...
    ui.error(t('comum.erro'), t('roll.sem_cartas'))
    ui.coins(valor, t.locale)
    ui.getRarity(carta.rarity, t.locale)
};
```

Use `battleRun.js` e `lojaRun.js` como modelo.

Função que só desenha (não tem `interaction`) recebe o `t` como
parâmetro, com `criarT(DEFAULT_LOCALE)` de padrão — ver
`escolhaDeTime.js`.

## Qual idioma cada mensagem usa

Não é uma escolha só, porque as mensagens têm donos diferentes:

| Mensagem | Idioma | Como obter |
|---|---|---|
| Resposta a um clique | de quem clicou | `tDaInteracao(interaction)` |
| DM para um jogador | dele | `tDoUsuario(userId, guildId)` |
| Quadro público duradouro | do servidor | `tDoUsuario(null, guildId)` |
| Troféu anunciado no canal | de quem conquistou | `tDoUsuario(vencedorId, guildId)` |

**Quadro duradouro** é a mesa de troca, o quadro do torneio e a
transmissão da batalha: mensagens que ficam no canal por minutos ou horas
e são editadas por mais de uma pessoa. Se seguissem o clique, trocariam
de idioma na frente de quem está lendo, por causa de uma ação do outro.

Quando a MESMA informação vai para vários destinos, ela é montada uma vez
por destino. O resultado da batalha, por exemplo, sai três vezes: canal
(servidor), privado de X (dele) e privado de Y (dele). As três recebem o
mesmo `result`, então placar, ELO e aposta são obrigatoriamente iguais —
só a língua muda.

## Cinco armadilhas

**`ui.cardName()` recebe a CARTA, não `carta.name`.** A assinatura é
`(carta, nivel, locale)`. Passar só o nome funciona — e **some com o
`(+3)` da carta aprimorada, em silêncio**. Sempre `ui.cardName(carta)`.

**Nunca conte nem procure evento varrendo texto.** Havia
`log.match(/CRÍTICO/g)` contando críticos para missões, e um
`log.filter((l) => l.includes('CRÍTICO'))` escolhendo o destaque da tela
final. Traduzir a palavra zeraria o troféu "Golpe certeiro" e faria o
destaque sumir — nos dois casos sem erro nenhum. Hoje tudo lê as flags do
evento (`crit`, `desperate`, `tipo`). Se precisar de algo novo, leia do
dado, nunca da frase.

**Texto de tela nunca é calculado antes de existir leitor.** O motor de
combate escrevia a narração dentro do resultado, e a mesma luta é lida
por dois jogadores que podem estar em idiomas diferentes. Hoje o evento
carrega só o que aconteceu e `narracao.descreverEvento(evento, t)` monta
a frase na hora de mostrar. Mesma regra para o que é gravado no banco: o
placar de bye do torneio guarda o código `'BYE'`, não `'passou direto'`.

**Catálogo guarda mecânica, não texto.** Troféus, missões, planos VIP,
molduras, divisões de ELO, **itens, caixas e dificuldades de treino** têm
só `chave`, condição e valores; nome e descrição vêm do dicionário. Como
a chave é o que fica no documento do jogador, trocar um texto nunca mexe
no que ele já tem. Use `achievements.localizar()`, `missoes.localizar()`,
`vip.nomeTier()`, `elo.divisao(elo, locale)`, `itens.localizar()`,
`caixas.localizar()`, `treino.localizarDificuldade()`.

Ler `.label` ou `.nome` do catálogo cru devolve `undefined` — e
`undefined` aparece na tela sem levantar exceção. Foi assim que a
Coleção do `/profile` passou um tempo mostrando "⚪ undefined: **5**".

**Número do jogo não vai escrito no dicionário.** A descrição do
`/loja roll-extra` cita o limite diário e a do `/caixa comprar` cita o
teto por compra; os dois entram por `{marcador}`, com o número vindo do
código. `descricaoBase()` e `localizacoes()` aceitam valores para isso.
Escrever o número na frase faria ela sobreviver à mudança da regra e
virar mentira em silêncio, nos dois idiomas de uma vez.

## Conferir antes de abrir PR

```bash
npm test
```

O `tests/i18n.test.js` trava os erros silenciosos:

- chave que existe num idioma e falta no outro;
- **chave que o código pede e não existe em lugar nenhum** — este é o mais
  comum, e o que não levanta exceção: `traduzir()` devolve a própria
  chave, e o jogador lê `loja.compra_concluida` no meio da tela;
- marcador `{valor}` presente só de um lado;
- dicionário inglês copiado do português;
- descrição de comando passando dos 100 caracteres que o Discord recusa.

## O que falta: o espanhol

A infraestrutura aguenta; o volume está na tradução.

- `Commands/locales/es-ES.json` — cerca de 800 chaves
- `utils/i18n.js`: acrescentar ao `DICIONARIOS` e ao `MAPA_DISCORD`
  (`es-ES` **e `es-419`**, o código LATAM do Discord — sem ele o cliente
  mexicano cai em inglês)
- `normalizar()`: o `if (base === 'pt'/'en')` precisa de um ramo `es`
- `/idioma`: uma escolha nova
- `tests/i18n.test.js`: hoje é fixo em `pt` e `en` (`const pt = require(...)`).
  Tem que iterar `LOCALES`, senão o espanhol entra sem rede

`escolhasRaridade()`, `localizacoes()` e `escolha()` já são dirigidos por
`LOCALES` — saem de graça. Os schemas não precisam de migração: `idioma`
é `String` livre, sem `enum`.

## Uma decisão de jogo em aberto

`contarDestaques` reproduz de propósito uma peculiaridade da contagem
antiga: `descreverEvento` usa `if/else if`, então uma **virada nunca é
contada como crítico**, apesar de mecanicamente ser um. Corrigir
aceleraria o troféu "Golpe certeiro" e a missão "Precisão" para todo
mundo — mudança de taxa de desbloqueio é decisão de jogo, não faxina de
código. Está comentado no arquivo.
