# Plano de evolução — da beta ao jogo com profundidade

Seis frentes pedidas, mais o que elas revelaram. Ordenado por dependência
e por risco, não por vontade.

| # | Item | Impacto | Risco | Fase |
|---|---|---|---|---|
| 0 | Telemetria de roll + snapshot da beta | alto | baixo | **agora** |
| 1 | **Valor por raridade** + migração | **altíssimo** | médio | 1 |
| 2 | Raridade nova + proteção contra azar | **altíssimo** | baixo | 2 |
| 3 | `/bolsa` + `/desmanchar` | alto | baixo | 3 |
| 4 | Aprimoramento de cartas | **altíssimo** | **alto** | 4 |
| 5 | Loja do jogo | alto | médio | 5 |
| 6 | Nível, cargas de roll, VIP e badges | alto | médio | 6 |
| 7 | Cartas de evento e não-negociáveis | alto | baixo | 7 |
| — | `/amistoso` (PvP sem valer nada) | médio | **mínimo** | avulso |
| — | ~~ELO por diferença de pontuação~~ | — | — | **✅ já existe** |

## Dois itens que saíram da lista

**ELO proporcional já está pronto.** `elo.js` usa ELO clássico com fórmula
de expectativa. Bronze 1000 contra Diamante 1600:

| Cenário | Vencedor | Perdedor |
|---|---|---|
| Bronze vence | Bronze **+31** | Diamante **−31** |
| Diamante vence | Diamante **+1** | Bronze **−1** |

É exatamente o comportamento pedido, com piso de 100 pontos e trava para
o perdedor nunca perder mais do que o vencedor ganhou.

**`/amistoso` é quase de graça.** Depois que o `/treino` passou a
compartilhar `escolhaDeTime.js` e `resultadoBatalha.js` com o `/battle`,
um duelo PvP sem aposta é o `/battle` sem `economy`, sem `elo` e sem
`progresso`. Poucas horas de trabalho, reusando tudo. Dá para encaixar em
qualquer fase.

---

## As duas coisas que precisam acontecer ANTES de tudo

### Telemetria de roll (não dá para recuperar depois)

Qualquer detecção de macro depende de **histórico de comportamento**. Hoje
o banco guarda só `lastRoll` — o instante do último roll. O anterior é
sobrescrito e perdido para sempre.

Começar a gravar o histórico hoje custa um campo e meia hora de trabalho.
Começar daqui a três meses significa três meses de dados que você nunca
vai ter, justamente do período em que os scripts mais atuaram.

**Grave desde já, sem punir ninguém:** timestamp de cada roll, e a
distância entre o roll e o fim do cooldown.

### Snapshot de quem jogou a beta

Você quer dar uma carta exclusiva para quem jogou a beta. Hoje não existe
nenhum campo dizendo "este jogador estava aqui na beta" — existe
`stats.diasAtivos` e `stats.rolls`, mas nenhuma marca temporal.

Se a beta acabar e só depois você for montar a lista, vai ter que decidir
no olho quem entra. **Rode um script agora** que marque
`beta: { participou: true, desde: <data> }` em quem já tem pelo menos N
rolls. Cinco minutos de trabalho que evitam uma discussão sem resposta.

---

## Fase 1 — Raridade, desmanche e `/bolsa`

### A Comum não é lixo — é a base

Correção da primeira versão deste plano. A Comum **luta**, tem valor
afetivo (o personagem favorito de alguém) e é peça de coleção. Ela não
precisa ser "salva" virando só matéria-prima: precisa ser **abundante e
barata**, que é o papel dela.

O que estava errado era outra coisa: **o preço**. Dez Comuns não podem
valer mais que uma Mestra. Isso é problema de economia, não de raridade —
está resolvido na seção "O valor das cartas", abaixo.

O desmanche continua no plano, mas como **destino opcional** da carta
repetida, não como salvação da Comum.

### Os números

Hoje: `common 55 · rare 28 · ultra 12 · legendary 4 · master 1`.

Com roll a cada 15 min, o teto é **96 rolls/dia** (160 para VIP, que tem
até -40% de cooldown). Um jogador engajado faz uns 30/dia. A 1%, ele tira
uma Mestra a cada **3 dias**. Não é lendário, é rotina.

Direção pedida: Comum **mais** comum, Rara um pouco mais rara, Ultra mais
rara, Lendária e Mestra **raríssimas**.

| | Comum | Rara | Ultra | Lendária | **Mestra** |
|---|---|---|---|---|---|
| **Hoje** | 55 | 28 | 12 | 4 | **1** |
| **Proposto** | **64** | 25 | 9,8 | **1,1** | **0,1** |

| Raridade | 1 a cada | Jogador de 30 rolls/dia |
|---|---|---|
| Ultra Rara | 10 rolls | 3 por dia |
| Lendária | 91 rolls | ~3 dias |
| **Mestra** | **1.000 rolls** | **~33 dias** |

**Âncora do CS**, já que foi sua referência: a faca de uma caixa é
**0,26%**. A Mestra a 0,1% fica **2,6x mais rara que uma faca** — e a
caixa aqui é grátis, o que justifica a diferença. Era exatamente o seu
raciocínio.

### "Evento do servidor": depende de quantos jogam

Raridade individual não controla isso sozinha. O que importa é o volume
de rolls do servidor inteiro:

| Jogadores ativos | Rolls/dia no servidor | Uma Mestra a cada |
|---|---|---|
| 10 | 300 | ~3 dias |
| 25 | 750 | ~32 horas |
| 50 | 1.500 | ~16 horas |
| 100 | 3.000 | ~8 horas |

Com a beta pequena, 0,1% já dá a sensação de evento. **Quando passar de
~40 jogadores ativos, caia para 0,05%** ou a Mestra vira rotina de novo.
Deixe o valor em variável de ambiente para ajustar sem deploy.

### Proteção contra azar

Probabilidade independente é cruel: existe gente que vai rolar 800 vezes
sem ver uma Lendária e desistir. Não é hipótese, é estatística.

Contador de "rolls sem Ultra Rara ou melhor". Ao chegar em 120, o próximo
roll é Ultra Rara garantida e o contador zera. Quase não muda a
distribuição e elimina o pior cenário de experiência.

---

## O valor das cartas — o conserto mais urgente

### O tamanho do problema

```js
// rollRun.js:119
const marketValue = card.overall * 10;
const valueToSell = marketValue / 2;
```

A raridade **não entra na conta**. Resultado:

| Carta | Valor de mercado | Venda rápida |
|---|---|---|
| 10× Comum OVR 30 | 3.000 | **1.500** |
| 1× Mestra OVR 90 | 900 | 450 |

Dez Comuns rendem mais que o valor cheio de uma Mestra. Com a Mestra indo
para 1-em-1.000, isso fica insustentável.

**Agravante:** a venda rápida **cria moeda do nada**. É a torneira de
inflação do jogo — o mercado entre jogadores é soma zero menos a taxa de
5%, mas o quicksell imprime dinheiro.

### A fórmula proposta

A raridade define a **ordem de grandeza**; o overall move dentro da faixa:

```js
const VALOR_BASE = {
  common: 60, rare: 350, 'ultra rare': 2000, legendary: 18000, master: 150000
};
const valor = Math.round(VALOR_BASE[raridade] * (0.7 + 0.6 * (overall / 100)));
```

| Carta | Valor novo | Antes |
|---|---|---|
| Comum OVR 30 | 53 | 300 |
| Rara OVR 60 | 371 | 600 |
| Ultra OVR 75 | 2.300 | 750 |
| Lendária OVR 88 | 22.100 | 880 |
| **Mestra OVR 95** | **190.500** | 900 |

Agora 10 Comuns valem 530 e uma Mestra vale 190 mil: **360x**. No CS a
razão entre skin comum e faca passa de 10.000x, então ainda somos
conservadores.

### Venda rápida decrescente

O quicksell existe para descartar repetida, não para liquidar tesouro.
Como ele imprime moeda, a porcentagem cai com a raridade:

| Raridade | % do valor |
|---|---|
| Comum | 50% |
| Rara | 45% |
| Ultra Rara | 35% |
| Lendária | 25% |
| Mestra | **15%** |

Quem tirou uma Mestra é empurrado para o **mercado de jogadores** — onde
a moeda troca de mãos e ainda paga 5% de taxa (sink), em vez de ser
criada do nada.

### 🚨 Três armadilhas na implementação

1. **12 lugares reconstroem o overall a partir do valor.** `inventoryRun`,
   `profileRun`, `marketRun`, `marketCollect`, `marketEnd`, `trocarRun`,
   `sellRun`, `sellCollect`, `undosellRun`, `escolhaDeTime` fazem
   `Math.round(marketValue / 10)` como fallback. Com o multiplicador de
   raridade isso passa a devolver overall errado **em silêncio**. Todos
   precisam ler `card.overall` de verdade.

2. **O valor fica gravado no inventário.** `rollCollect.js:31` salva
   `marketValue` e `valueToSell` na carta. Mudar a fórmula só afeta cartas
   novas — precisa de script de migração para recalcular o acervo inteiro.

3. **A economia encolhe de uma vez.** A renda de quicksell cai ~6x.
   `/daily` e missões continuam pagando o mesmo, então a proporção entre
   as fontes muda bastante. Suba os valores base atrás de variável de
   ambiente e acompanhe a primeira semana.

### Proteção contra azar (o que o CS não tem e faz falta)

Probabilidade independente é cruel: existe gente que vai rolar 800 vezes
sem ver uma Lendária e desistir do bot. Não é hipótese, é estatística.

**Proposta:** um contador de "rolls sem Ultra Rara ou melhor". Ao chegar
em 120, o próximo roll é Ultra Rara garantida, e o contador zera.

Isso não muda quase nada a distribuição (poucos chegam lá) e elimina o
pior cenário possível de experiência. É o "soft pity" de qualquer gacha
moderno.

### Desmanche: o que salva a Comum

Novo comando `/desmanchar`. Transforma carta em **fragmentos**, que vão
para a `/bolsa` e alimentam o aprimoramento.

| Raridade desmanchada | Fragmentos |
|---|---|
| Comum | 1 |
| Rara | 3 |
| Ultra Rara | 10 |
| Lendária | 35 |
| Mestra | 120 |

Isso resolve três coisas de uma vez:

1. **Comum vira recurso.** Um roll comum deixa de ser desperdício.
2. **Novo sink de cartas.** Hoje o inventário só cresce; o mercado
   satura. Desmanchar tira carta de circulação.
3. **Dá escolha.** Vender por moeda, guardar para a Pokédex ou desmanchar
   para evoluir a favorita — três destinos, cada um com um custo.

⚠️ **Trave o desmanche de carta ainda não descoberta na Pokédex**, ou peça
confirmação dupla. Alguém vai desmanchar sem querer a única cópia de uma
carta que faltava na dex e vai ficar bravo — com razão.

### `/bolsa`

Estrutura nova no `userSchema`, pensada para servir a tudo que vier
depois, não só ao aprimoramento:

```js
bolsa: [{
  item: String,        // 'fragmento', 'gema', 'protecao', 'bilhete_roll'
  quantidade: Number
}]
```

Um catálogo de itens em `utils/itens.js`, no mesmo espírito do
`achievements.js`: definição declarativa, um lugar só.

### Consertar o valor de mercado

Hoje, em `rollRun.js:119`:

```js
const marketValue = card.overall * 10;
```

**O valor ignora a raridade por completo.** Uma Mestra de overall 90 e uma
Comum de overall 90 valem o mesmo. Se a Mestra passar a ser 1-em-500, isso
fica absurdo.

```js
const MULTIPLICADOR = { common: 1, rare: 1.5, 'ultra rare': 2.5, legendary: 6, master: 15 };
const marketValue = Math.round(card.overall * 10 * MULTIPLICADOR[card.rarity]);
```

Sem isso, a mudança de raridade não chega na economia.

---

## Fase 2 — Aprimoramento

A maior feature, e a de maior risco. O modelo do GrandChase funciona bem,
mas tem uma armadilha.

### Onde o nível mora

Na **cópia do inventário**, não no catálogo. Isso já está pronto: cada
carta no inventário tem `_id` próprio e stats próprios. Só entram campos
novos no subdocumento:

```js
nivel: { type: Number, default: 0 },
tentativas: { type: Number, default: 0 }   // histórico, para a ficha
```

### Teto por raridade

Como você pediu — e isso dá um segundo motivo para caçar raridade, além
dos atributos base:

| Raridade | Teto | Overall máximo aprox. |
|---|---|---|
| Comum | +3 | ~63 |
| Rara | +5 | ~75 |
| Ultra Rara | +7 | ~87 |
| Lendária | +9 | ~99 |
| Mestra | **+12** | **~111** |

Passar de 99 fica reservado à Mestra no talo. Exatamente o "99 deve ser
bem difícil de subir" que você descreveu.

### Chance e custo

| Nível | Chance | Fragmentos | Moedas | Falha faz o quê |
|---|---|---|---|---|
| +1 a +3 | 90% → 75% | 5–15 | 500–2k | nada |
| +4 a +6 | 60% → 45% | 25–50 | 5k–15k | nada |
| +7 a +9 | 35% → 22% | 80–150 | 25k–50k | **-1 nível** |
| +10 a +12 | 15% → 8% | 200–400 | 80k–150k | **-1 nível** |

### As três regras da falha

Conforme definido:

1. **A carta nunca é destruída.** Ela é colecionável, tem `_id` único e
   pode ser a única cópia daquela arte no servidor. Destruir a Lendária de
   alguém faz a pessoa desinstalar e falar mal do bot no servidor inteiro.
2. **O overall natural é o piso absoluto.** Uma carta que nunca subiu
   **não pode descer**. `nivel` nunca fica negativo, e o `-1` só existe se
   `nivel > 0`.
3. **Falhar em +1 não zera nada** — perde só o material investido.

Em código, a regra inteira cabe numa linha:

```js
const novoNivel = sucesso ? nivel + 1 : Math.max(0, nivel - (nivel > 0 && faixaDeRisco ? 1 : 0));
```

`Pergaminho de proteção` (loja): segura o -1 numa falha. Vira o item mais
vendido e o maior sink de moeda do jogo.

### 🚨 O risco que precisa ser decidido antes de escrever código

Uma Mestra +12 com overall 111 enfrenta um novato com Rara 55. O
`battleEngine` usa ATA/LIF/POW crus — **não existe normalização**.

O jogo tem hoje um princípio explícito, escrito no código e **protegido
por teste** (`tests/vip.test.js`, "NENHUM PLANO PODE DAR VANTAGEM DE
COMBATE"): dinheiro real não compra poder. O aprimoramento não quebra isso
(é moeda do jogo), mas cria um vizinho perigoso — quem joga há mais tempo
fica intocável no ranking.

Três saídas, e essa escolha é sua:

1. **Ligar o bônus ao ELO.** Divisões separam quem tem carta evoluída.
   Mais justo, exige mais jogadores para as filas funcionarem.
2. **Bônus percentual, não fixo.** `+2% por nível` em vez de `+1 ponto`.
   Uma Comum +3 ganha pouco; uma Mestra +12 ganha muito — mas a diferença
   entre elas não explode.
3. **Aceitar o desnível.** É um jogo de coleção; quem investe fica forte.
   Simples, e arrisca afastar quem chega depois.

Minha recomendação: **(2) agora, (1) quando houver jogadores suficientes**.

---

## Fase 3 — Loja

Regra que decide tudo: **a loja existe para tirar moeda de circulação.**
Hoje o único sink é a taxa de 5% do mercado — e entram ~10k/dia por
jogador ativo entre venda de cartas, `/daily` e missões. A moeda está
inflacionando.

### O que vender

| Item | Preço sugerido | Por quê |
|---|---|---|
| **Gema de aprimoramento** | 2k–8k | Sink principal, ligado à Fase 2 |
| **Pergaminho de proteção** | 25k | Caro de propósito: é seguro, não atalho |
| **Moldura / cor / banner** | 15k–60k | Sink perfeito: zero impacto em equilíbrio |
| **Apelido na carta** | 10k | A carta tem `_id` único — dá para batizar |
| **Reroll de missão diária** | 3k | Conveniência barata |
| **Passe de mercado** (taxa 0% por 24 h) | 20k | Aquece o mercado |
| **Roll extra** | **escalonado** | ⚠️ ver abaixo |

### ⚠️ Sobre "comprar um roll"

É a ideia mais natural e a mais perigosa. Roll extra converte moeda em
carta, e carta em moeda — vira uma alça de realimentação onde o jogador
rico rola mais, tira mais carta boa, vende, e rola ainda mais.

Se entrar, precisa de duas travas:

- **Limite diário rígido** (2 ou 3 por dia)
- **Preço escalonado no mesmo dia**: 1º = 5k, 2º = 15k, 3º = 40k

Assim ele é um "adiantei meu próximo roll", não uma torneira.

### Ideia extra: caixa temática

Roll restrito a uma série (`Naruto`, `Jujutsu Kaisen`), preço alto
(~25k), **com Rara garantida**. Ajuda quem está fechando uma série na
Pokédex e é um sink excelente. Casa perfeitamente com a conquista de
"séries completas" que já existe no `progresso.js`.

---

## Fase 4 — Nível de jogador

XP por ação: roll, batalha, troca, descoberta na dex, missão, daily.

### Cargas de roll a cada 10 níveis

| Nível | Recompensa |
|---|---|
| 5 | 5.000 moedas + 10 fragmentos |
| **10** | **+1 carga de roll** (acumula 2) |
| 15 | Moldura exclusiva de nível |
| **20** | **+1 carga** (total 3) + proteção contra azar de 120 → 100 |
| 25 | Título no `/profile` |
| **30** | **+1 carga** (total 4) |

"Carga de roll" é a peça central: quem não pôde entrar de manhã acumula e
rola várias vezes à noite. Resolve a dor real do cooldown — quem trabalha
perde rolls — e ainda **reduz o incentivo ao macro**, que hoje ganha
justamente por nunca dormir.

### VIP: onde fica o "um pouco pay-to-win"

Pedido: o VIP precisa ser mais atraente do que é hoje.

A linha que eu recomendo manter é **quantidade, nunca sorte**:

| Alavanca | Vale a pena? |
|---|---|
| Cooldown menor (já existe) | ✅ |
| **+1 a +2 cargas de roll** | ✅ a mais forte |
| Taxa de mercado reduzida | ✅ |
| Quicksell com % melhor | ✅ |
| Pergaminho de proteção mensal | ✅ |
| Moldura, badge e cor exclusivas | ✅ |
| Bolsa maior | ✅ |
| **Chance de raridade melhor** | ❌ |
| **Atributo de combate** | ❌ (teste do projeto barra) |

**Isso já é pay-to-win — e tudo bem.** Mais rolls significa,
estatisticamente, mais Mestras ao longo do mês. A diferença é que é
*transparente*: o assinante joga mais, não tem sorte melhor.

Por que não mexer nas odds, mesmo querendo apertar o VIP: em
`rollRun.js:69` está escrito que *"o sorteio é igual para todo mundo"*, e
o `tests/vip.test.js` protege isso. Hoje é a frase mais forte que você tem
contra os concorrentes pay-to-win — e odds compradas é exatamente o que
faz jogador acusar bot de ser rigged. Cooldown menor ninguém contesta,
porque é visível e verificável.

### Badges e identidade no perfil

Pedido, e barato de fazer. `/profile` ganha uma linha de selos:

| Badge | Origem |
|---|---|
| 🧪 Beta | snapshot da Fase 0 |
| 👑 VIP | assinatura ativa (por tier) |
| 🛡️ Staff | novo campo `staff: Boolean` |
| 🏆 Conquistas | as 28 do `achievements.js`, já existem |
| ⭐ Nível | a partir da Fase 4 |

Emojis personalizados exigem que o bot esteja num servidor com os emojis
enviados e usa a sintaxe `<:nome:id>`. O `embeds.js` já centraliza esse
tipo de constante — o lugar natural é lá.

Não existe nada de staff hoje. Um `staff: { type: Boolean, default: false }`
no `userSchema` resolve, editável pelo painel admin que já existe.

---

## Fase 5 — Cartas de evento

A mais simples das grandes, e a de maior retorno percebido.

### Schema

No **catálogo** (`cardSchema.js`):

```js
origem: { type: String, default: 'roll' },        // 'roll' | 'evento' | 'loja'
distribuivel: { type: Boolean, default: true },   // entra no sorteio do /roll?
comercializavel: { type: Boolean, default: true } // pode ir a mercado/troca?
```

Na **cópia do inventário** (`userSchema.js`), repita `comercializavel`.
Isso não é redundância: a negociabilidade fica **congelada no momento em
que a carta foi dada**. Se você mudar a regra do catálogo depois, quem já
tinha a carta não é afetado — e ninguém perde o direito de vender algo que
comprou sob outra regra.

### Pontos de código a tocar

| Onde | O quê |
|---|---|
| `rollRun.js:50` | `$match` precisa de `distribuivel: { $ne: false }` |
| `marketRun` / `sellRun` | recusar carta não-negociável |
| `trade.js` | idem |
| `giveRun` | idem |
| `/desmanchar` (novo) | decidir se evento pode ser desmanchada (sugiro **não**) |
| Painel admin (`app/admin/cartas`) | os três campos + ação "distribuir" |

O `npm run cards:grant` já existe e é o mecanismo de distribuição. Falta
só o painel chamar a mesma lógica.

### A carta da beta

Exatamente como você desenhou: **exclusiva, negociável, valor agregado
altíssimo**. Ser negociável é o certo — é o que cria a história de "aquele
cara vendeu a carta da beta por 500k".

O `distribuivel: false` garante que ela nunca mais saia de um roll. A
escassez é permanente e verificável, que é de onde vem o valor.

Só depende do **snapshot da Fase 0**. Sem a lista, não há a quem dar.

---

## Fase 6 — Detecção de macro

Deixei por último de propósito: é a de maior risco de **falso positivo**,
e banir um jogador legítimo custa mais do que tolerar um script por mais
um mês.

### O que o macro realmente ganha

O cooldown de 15 min é validado no servidor (`rollRun.js:73`), contra
`user.lastRoll` no banco. **Um script não consegue rolar mais rápido que
isso.** Não existe roll infinito.

O que ele ganha é **nunca perder um roll**: 96/dia contra os ~25 de um
humano que dorme e trabalha. Quase 4x mais cartas. É econômico, não
técnico — e é por isso que "carga de roll" (Fase 4) reduz o incentivo
sozinha, sem banir ninguém.

### Os sinais que denunciam

| Sinal | O que medir | Por que funciona |
|---|---|---|
| **Pontualidade** | atraso entre o fim do cooldown e o roll | Humano varia minutos. Script rola em < 2 s, sempre. |
| **Ausência de sono** | histograma de atividade por hora | Todo humano tem 6–8 h de buraco por dia |
| **Latência do clique** | tempo entre a resposta e "Guardar no inventário" | Humano leva 1–5 s; macro, ~200 ms |
| **Sessão contínua** | atividade ininterrupta > 16 h | Não acontece de verdade |

Isoladamente cada um erra. **Juntos, o desvio-padrão da pontualidade
sozinho já separa quase tudo:** um humano tem desvio de minutos, um script
tem de milissegundos.

### Como punir

**Nunca banir automaticamente.** O fluxo:

1. Bot calcula um score e grava no usuário
2. Painel admin ganha uma aba "Suspeitos", ordenada por score, com os
   gráficos que embasam
3. **Você** decide, com o histórico na tela
4. A punição usa o sistema de banimento que **já existe** e já é temporário
   (`banimento.expiraEm`) — nada de novo aqui

Escada sugerida: 1º aviso no privado → 24 h → 7 dias → permanente.

Um degrau intermediário elegante antes do banimento: **cooldown
progressivo silencioso** para score alto. O script continua rodando e
rendendo cada vez menos, sem você precisar acusar ninguém. Quem for falso
positivo mal percebe; quem for script desiste sozinho.

Vale lembrar: self-bot viola os Termos do Discord. Você tem respaldo para
banir e ainda pode denunciar.

---

## Ordem sugerida

```
Fase 0  (telemetria + snapshot da beta)   ← dado que não volta atrás
   ↓
Fase 1  (VALOR por raridade + migração)   ← a raiz do problema de economia
   ↓
Fase 2  (raridade nova + anti-azar)       ← só faz sentido DEPOIS do valor
   ↓
Fase 3  (/bolsa + /desmanchar)            ← base para tudo que vem depois
   ↓
Fase 4  (aprimoramento)                   ← depende da /bolsa
   ↓
Fase 5  (loja)                            ← depende dos itens da Fase 4
   ↓
Fase 6  (nível + cargas + VIP + badges)  ┐ independentes entre si,
Fase 7  (cartas de evento)               ┘ dá para intercalar
```

**Por que o valor vem antes da raridade:** deixar a Mestra 1-em-1.000
enquanto ela vale 900 moedas não conserta nada — só faz o jogador esperar
33 dias por algo que 10 Comuns pagam. A escassez precisa aparecer no preço
antes de aparecer na taxa de drop.

A Fase 7 só precisa que o snapshot da Fase 0 exista. Se a beta estiver
perto de acabar, ela pode furar a fila.

---

## O que eu acrescentaria

**Proveniência da carta.** Ela já tem `_id` único; guardar a corrente de
donos (`donoOriginal`, `trocas: N`) é barato e transforma qualquer carta
de evento numa relíquia com história. "Esta carta passou por 7 jogadores
desde a beta" é conteúdo de graça.

**Bônus de coleção.** Completar uma série na Pokédex já é conquista; podia
render um item ou uma moldura. O `progresso.js` **já calcula
`seriesCompletas`** — o dado está lá, sem uso.

**Missão semanal de desmanche.** Fecha o ciclo da Fase 1 e ensina a
mecânica nova sem tutorial.

---

## Riscos que ficam registrados

1. **Aprimoramento sem normalização quebra o ranking.** Decisão pendente
   entre as três saídas da Fase 2.
2. **Raridade mais dura torna a Pokédex quase impossível** para quem só
   rola. O mercado e a troca passam a ser o caminho — o que é bom, mas
   precisa estar claro para o jogador.
3. **A loja pode virar torneira** se o roll comprado não tiver teto.
4. **Nível com odds melhores fura o princípio** de sorteio igual, que hoje
   é argumento de venda contra bots pay-to-win.
5. **Falso positivo de macro custa caro.** Por isso o degrau do cooldown
   progressivo antes de qualquer banimento.
