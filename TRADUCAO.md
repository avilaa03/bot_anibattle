# Como o bot fala dois idiomas

Português e inglês. Este documento é a referência de quem for mexer nisso
— e o mapa para terminar a tradução, que está pela metade.

## Estado atual

A branch `trad` tem a **base pronta** sobre a `main` atual: infraestrutura,
dicionários completos e os utilitários compartilhados. Faltam os arquivos
de comando.

| Pronto | Falta |
|---|---|
| `utils/i18n.js`, `utils/idioma.js`, `utils/guildSchema.js` | 26 arquivos de comando (lista abaixo) |
| `locales/pt-BR.json` e `en-US.json` (789 chaves) | 7 comandos novos |
| `/idioma` (`/language` em inglês) | |
| `embeds.js`, catálogos, `tournament`, `notificacoes` | |

`npm test` passa (27 arquivos).

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

Use `rollRun.js` e `battleRun.js` como modelo — estão completos.

## Qual idioma cada mensagem usa

Não é uma escolha só, porque as mensagens têm donos diferentes:

| Mensagem | Idioma | Como obter |
|---|---|---|
| Resposta a um clique | de quem clicou | `tDaInteracao(interaction)` |
| DM para um jogador | dele | `tDoUsuario(userId, guildId)` |
| Quadro público duradouro (torneio) | do servidor | `tDoUsuario(null, guildId)` |
| Troféu anunciado no canal | de quem conquistou | `tDoUsuario(vencedorId, guildId)` |

O quadro do torneio segue o servidor porque fica horas no canal: se
seguisse o clique, trocaria de idioma a cada inscrição.

## Quatro armadilhas

**`ui.cardName()` recebe a CARTA, não `carta.name`.** A assinatura é
`(carta, nivel, locale)`. Passar só o nome funciona — e **some com o
`(+3)` da carta aprimorada, em silêncio**. Sempre `ui.cardName(carta)`.

**Nunca conte evento varrendo texto.** Havia
`log.match(/CRÍTICO/g)` contando críticos para missões e conquistas.
Traduzir a palavra zeraria o troféu "Golpe certeiro" sem erro nenhum.
Hoje `contarDestaques` lê os eventos estruturados. Se precisar contar algo
novo, conte do dado, nunca da frase.

**Nada de texto de tela gravado no banco.** O placar de bye do torneio era
gravado como `'passou direto'`, congelando o português no histórico. Hoje
grava o código `'BYE'` e traduz na exibição. Mesma regra para qualquer
coisa persistida.

**Catálogo guarda mecânica, não texto.** Troféus, missões, planos VIP,
molduras e divisões de ELO têm só `chave`, condição e valores; nome e
descrição vêm do dicionário. Como a chave é o que fica no documento do
jogador, trocar um texto nunca mexe no que já foi conquistado. Use
`achievements.localizar()`, `missoes.localizar()`, `vip.nomeTier()`,
`elo.divisao(elo, locale)`.

## Conferir antes de abrir PR

```bash
npm test
```

O `tests/i18n.test.js` trava os erros silenciosos: chave faltando num
idioma, marcador `{valor}` presente só num lado, dicionário inglês
copiado do português, e descrição de comando passando dos 100 caracteres
que o Discord recusa.

## Terminar: os 26 arquivos

Cada um precisa da versão da `main` **com a tradução reaplicada por
cima**. Ficar só com a versão traduzida antiga descarta lógica nova de
verdade — foi verificado.

O caminho que funciona:

```bash
git show "feat/idioma-ingles:<arquivo>" > /tmp/meu
git show "eb53e6e:<arquivo>"            > /tmp/base
git show "origin/main:<arquivo>"        > /tmp/main
git merge-file -p --diff3 /tmp/meu /tmp/base /tmp/main > <arquivo>
```

Depois resolver os blocos: fica o texto traduzido, entra a linha nova da
`main`. O que a `main` adicionou em cada um:

| Arquivo | Trazer da main |
|---|---|
| `collect/marketCollect.js` | `valores.overallDaCarta()` |
| `collect/quicksellCollect.js` | `transacoes.registrar()` (livro-razão) |
| `collect/rollCollect.js` | parâmetro `mostradoEm` |
| `collect/battleCollect.js` | `montarEscolhaDeTime()` |
| `run/fichaRun.js` | `valores.valoresDaCarta().marketValue` |
| `run/sellRun.js` | `negociabilidade.podeNegociar()` |
| `run/inventoryRun.js` | `valores.overallDaCarta` |
| `run/showRun.js` | `valores.valoresDaCarta().valueToSell` |
| `run/pokedexRun.js` | dex de eventos (`dex:evento`) |
| `run/helpRun.js` | 8 entradas novas no manual |
| `end/marketEnd.js` | `valores.valoresDaCarta()`, campo `nivel` |

Os demais são só troca de string.

## Terminar: os 7 comandos novos

`/aprimorar` · `/bolsa` · `/caixa` · `/desmanchar` · `/evento` · `/loja` ·
`/treino`, mais os utilitários que vieram com eles (`valores`, `itens`,
`nivel`, `aprimoramento`, `sorteio`, `negociabilidade`, `transacoes`).

Vocabulário aprovado para o inglês:

| PT | EN |
|---|---|
| gema | Gem |
| pergaminho | Scroll |
| caixa | Box |
| aprimorar | Upgrade |
| desmanchar | Salvage |
| bolsa | Bag |
| loja | Shop |
| roll extra | Extra Roll |
| carta vinculada | Bound card |

A raridade `event` já está nos dois dicionários (Evento / Event).

## Uma decisão de jogo em aberto

`contarDestaques` reproduz de propósito uma peculiaridade da contagem
antiga: `descreverGolpe` usa `if/else if`, então uma **virada nunca era
contada como crítico**, apesar de mecanicamente ser um. Corrigir
aceleraria o troféu "Golpe certeiro" e a missão "Precisão" para todo
mundo — mudança de taxa de desbloqueio é decisão de jogo, não faxina de
código. Está comentado no arquivo.
