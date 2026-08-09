# Análise do Bot AniBattle – TCG no Discord

Documento com os **principais pontos de melhoria** e **adições** para o bot se tornar um TCG de qualidade.

---

## Preparação para vários servidores (atualizado)

O bot foi ajustado para rodar em **vários servidores** com a mesma instância. Resumo do que foi feito:

| Melhoria | Implementação |
|----------|----------------|
| **Evitar "Unknown interaction"** | Comandos que fazem trabalho pesado (DB + imagem ou listas grandes) usam `deferReply()` e depois `editReply()`: **roll**, **favcard**, **show**, **market**, **undosell**, **magnata**, **quicksell**. |
| **Respostas consistentes** | Erros e mensagens de validação passaram a usar **embeds** (título, descrição, cor): roll (erro, cooldown, sem cartas), battle (5 validações), profile, show, favcard, quicksell, inventory, index (comando desconhecido, erro global). |
| **Performance no banco** | **Índices** adicionados: `User` em `balance` (magnata); `Market` em `(status, listingPrice)` e `(sellerId, status)`; `Card` em `rarity` (roll). |
| **Comandos globais** | Slash commands registrados via `applicationCommands(CLIENT_ID)` (sem guild) — aparecem em todos os servidores. Comando de teste **testcmd** removido do registro. |
| **Tratamento de erro** | Em `index.js`, erro genérico em embed; em **magnataRun**, erro após defer usa `editReply` em vez de `reply`. Handler "enviarInventario" removido (fluxo do roll já trata pelos collectors). |

**Observação:** O mesmo usuário tem **um único perfil/inventário** em todos os servidores (economia global). Estado de batalha é em memória, keyed por ID da mensagem (sem colisão entre servidores).

---

## Status de implementação (atualizado)

### Resumo rápido
| Item | Status |
|------|--------|
| **CardBuilder**: cores por raridade, bordas arredondadas, brilho legendary/master, truncar nome, try/catch loadImage, placeholder, schema removido | ✅ Feito |
| **Sistema de batalha**: desafio → aceitar → escolher 3 cartas (DM) → combate ATA/LIF/POW → resultado e recompensas | ✅ Feito |
| **rollRun**: raridades ativas e balanceadas (55% / 28% / 12% / 4% / 1%) | ✅ Feito |
| **/ranking**: por vitórias ou por moedas | ✅ Feito |
| **/help**: atualizado com /battle, /ranking e cooldown do roll | ✅ Feito |
| **Bugs**: showCollect, favcardRun, battleCollect ButtonStyle | ✅ Corrigidos |
| **Mercado**: filtro por raridade (choices) e por série | ✅ Feito |
| Comando /deck, histórico de batalhas no banco | 🔲 Pendente |

### Checklist detalhado (análise → implementação)

**1. Visual das cartas (CardBuilder)**  
| Problema / Melhoria | Feito? | Observação |
|--------------------|--------|------------|
| Cores por raridade (bordas, títulos) | ✅ | common/rare/ultra rare/legendary/master com paleta própria |
| Truncar nome com "…" e centralizar | ✅ | Máx. 22 caracteres, centralizado |
| try/catch em loadImage + placeholder | ✅ | Placeholder "Imagem indisponível" e fundo cinza se URL falhar |
| Remover schema Mongoose do CardBuilder | ✅ | Só cardSchema.js define o modelo |
| Bordas arredondadas | ✅ | `drawRoundedRect` + clip na imagem base |
| Sombra no texto | ✅ | Nome da carta com sombra |
| Brilho no contorno para raridades altas | ✅ | Legendary e master ganham contorno com “glow” (várias bordas com alpha) |
| Fontes customizadas (ex.: Google Fonts / .ttf) | 🔲 | Continua Arial; fontes custom no canvas exigem .ttf no projeto |

**2. Sistema de batalha**  
| Item | Feito? |
|------|--------|
| Import de ButtonStyle em battleCollect | ✅ |
| Seleção real de 3 cartas (botões por carta no DM) | ✅ |
| Estado da batalha em mapa (battleState.js) | ✅ |
| Handlers para battle_pick_* no index / handler | ✅ |
| Motor de combate ATA/LIF/POW (battleEngine.js) | ✅ |
| Resultado e recompensas (moedas, wins/losses) | ✅ |
| Fluxo completo desafio → aceitar → escolher → combate → resultado | ✅ |

**3. Bugs críticos**  
| Arquivo | Feito? |
|---------|--------|
| battleCollect ButtonStyle | ✅ |
| showCollect paginação com attachment da imagem | ✅ |
| favcardRun CardBuilder + await updateEmbed + files | ✅ |

**4. Outras melhorias**  
| Item | Feito? |
|------|--------|
| Raridades no roll ativas e balanceadas | ✅ |
| Cooldown do roll exposto no /help | ✅ |
| /ranking (vitórias ou moedas) | ✅ |
| Filtros no mercado: raridade (com choices) e série | ✅ |
| /deck ou deck de batalha pré-definido | 🔲 |
| Histórico de batalhas no banco | 🔲 |
| Handlers de botões centralizados (ex.: um único handler) | 🔲 Parcial | battle_pick em handler próprio; enviarInventario no rollCollect |
| currentCollector global em roll/favcard (risco de conflito) | 🔲 | Melhoria futura: mapa por userId |

---

## 1. Visual das cartas (`CardBuilder`)

### Problemas atuais
- **Fonte**: Uso de Arial genérico; não transmite identidade de TCG.
- **Cores**: Texto branco/preto fixo; sem diferenciação por raridade (common, rare, legendary, etc.).
- **Layout**: Muito “quadrado”; sem bordas decorativas, sombras ou efeitos de brilho por raridade.
- **Texto**: Nome em uma linha só; nomes longos podem cortar ou quebrar o layout.
- **Imagens**: Sem fallback se `loadImage` falhar (URL quebrada); pode derrubar o bot.
- **Schema duplicado**: `cardBuilder.js` declara um modelo Mongoose próprio em vez de usar o `cardSchema.js`.

### Melhorias sugeridas
- **Cores por raridade**: Bordas e títulos com cores (ex.: common=cinza, rare=azul, legendary=dourado).
- **Fontes**: Usar fontes customizadas (ex.: Google Fonts via canvas ou fontes locais) para nome e stats.
- **Efeitos visuais**: Bordas arredondadas, sombra no texto, pequeno brilho no contorno da carta para raridades altas.
- **Tratamento de texto**: Limitar tamanho do nome (ex.: truncar com “…”) e centralizar.
- **Resiliência**: `try/catch` em `loadImage` e imagem placeholder ou mensagem de erro em vez de crash.
- **Reuso**: Remover o schema de dentro do `CardBuilder` e receber só os dados da carta (já feito via `cardData`); garantir que só `cardSchema.js` define o modelo.

---

## 2. Sistema de batalha

### Estado atual
- **Fluxo**: Desafio → botão “Aceitar Batalha” → DM “Escolha 3 cartas” com botões.
- **Problemas**:
  - `battleCollect.js` usa `ButtonStyle.Primary` mas **não importa** `ButtonStyle` → **erro em tempo de execução**.
  - Não existe handler para os botões `cardX_0`, `cardX_1`, `cardX_2` e `cardY_0`, `cardY_1`, `cardY_2` no `index.js` (ou em outro collector).
  - Escolha de cartas: só são mostradas as 3 primeiras do inventário; não há seleção real de “quais” 3 cartas.
  - Não há confirmação das 3 cartas nem início do combate.
  - Não existe **motor de combate** usando ATA, LIF e POW.
  - Não há mensagem de resultado (vitória/derrota) nem recompensas (moedas, ranking, etc.).

### Adições necessárias para um TCG completo

1. **Import**  
   - Em `battleCollect.js`: `const { ..., ButtonStyle } = require('discord.js');`

2. **Seleção de cartas**
   - Em vez de “primeiras 3”, usar **select menus** ou botões paginados para cada jogador escolher 3 cartas do inventário.
   - Guardar estado da batalha (quem escolheu o quê) em um mapa em memória ou em coleção (ex.: `battleId → { userX, userY, deckX, deckY, phase }`).

3. **Handlers de interação**
   - No `index.js` (ou em um módulo de handlers de botões/selects): tratar `accept_battle`, `cardX_*`, `cardY_*` e IDs de confirmação de deck.
   - Ou estender o collector em `battleCollect` para também escutar DMs (com filtro por canal e usuário) até ambos confirmarem o deck.

4. **Motor de combate**
   - Definir fórmula de combate usando ATA, LIF, POW (ex.: rodadas onde cada carta ataca a outra; dano baseado em ATA/POW; vida em LIF).
   - Exemplo simples: rodadas 1v1 entre as 3 cartas de cada lado; soma de “vida restante” ou “cartas derrubadas” define o vencedor.
   - Gerar mensagem passo a passo (opcional) e depois embed de resultado.

5. **Recompensas e persistência**
   - Dar moedas ao vencedor (e talvez ao perdedor).
   - Opcional: schema de “Batalha” ou “Histórico” no MongoDB; ranking (vitórias/derrotas no `userSchema`).

6. **Fluxo completo sugerido**
   - Desafio → Aceitar → Escolher 3 cartas (cada um no DM) → Confirmar deck → Executar combate → Resultado + recompensas.

---

## 3. Bugs críticos encontrados

| Arquivo | Problema | Correção |
|--------|----------|----------|
| `battleCollect.js` | Uso de `ButtonStyle.Primary` sem import | Adicionar `ButtonStyle` ao `require('discord.js')`. |
| `showCollect.js` | Na paginação (Anterior/Próximo), o embed usa `attachment://cardImage.png` mas **nenhum attachment** é enviado no `update` | Em cada clique, gerar a nova imagem com `CardBuilder`, criar `AttachmentBuilder` e usar `i.update({ embeds: [embed], components: [row], files: [attachment] })`. |
| `favcardRun.js` | Uso de `CardBuilder` sem `require` | Adicionar `const CardBuilder = require('../../utils/cardBuilder.js');`. |
| `favcardRun.js` | `updateEmbed()` é `async` mas é usado como `embeds: [updateEmbed()]` sem `await`; além disso não envia o arquivo da imagem | Usar `await updateEmbed()` e fazer `updateEmbed` retornar `{ embed, attachment }` e enviar `files: [attachment]` no `reply`. |

---

## 4. Outras melhorias gerais

### Roll / economia
- **Raridades**: No `rollRun.js` a maioria das raridades está comentada; só “common” está ativa. Ativar rare, ultra rare, legendary, master com percentuais balanceados.
- **Cooldown**: 15 min está ok; pode expor isso no `/help` ou na mensagem de erro.

### Comandos úteis para TCG
- **`/deck`** ou **`/deck build`**: Montar “deck de batalha” (ex.: 3–5 cartas favoritas) usado automaticamente quando alguém aceita um desafio (ou como atalho na hora de escolher cartas).
- **`/ranking`** ou **`/leaderboard`**: Top jogadores por vitórias ou por moedas.
- **`/historico`** ou **`/batalhas`**: Últimas batalhas do usuário (se guardar histórico no banco).

### Inventário e mercado
- **show**: Na paginação, manter a imagem da carta atual (correção do bug acima já cobre isso).
- **Mercado**: Filtros por raridade/série no `/market` melhoram muito a experiência.

### Código e arquitetura
- **Handlers de botões**: Centralizar em um único lugar (ex.: `handlers/buttonHandler.js`) e no `interactionCreate` chamar esse handler em vez de só `enviarInventario`; assim fica fácil adicionar `accept_battle`, `cardX_*`, `cardY_*`, etc.
- **CardBuilder**: Remover o modelo Mongoose de dentro do arquivo e usar apenas `cardSchema.js` para o banco.
- **Variáveis globais**: `currentCollector` em `rollRun` e `favcardRun` pode causar conflito se dois usuários usarem ao mesmo tempo; preferir collectors por mensagem ou por usuário (mapa `userId → collector`).

---

## 5. Resumo das prioridades

| Prioridade | Item |
|-----------|------|
| Alta | Corrigir import de `ButtonStyle` em `battleCollect.js`. |
| Alta | Corrigir paginação em `showCollect.js` (enviar imagem no update). |
| Alta | Corrigir `favcardRun.js` (import de `CardBuilder` + await e attachment no reply). |
| Alta | Implementar handlers para escolha de cartas na batalha e motor de combate (ATA/LIF/POW). |
| Média | Melhorar visual do `CardBuilder` (cores por raridade, fontes, bordas). |
| Média | Ativar e balancear raridades no roll. |
| Baixa | Comando `/deck`, `/ranking`, histórico de batalhas, centralizar handlers de botões. |

---

Este documento pode ser usado como roadmap para transformar o AniBattle em um TCG completo e visualmente atraente no Discord.
