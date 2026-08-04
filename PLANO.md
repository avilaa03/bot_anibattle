# Plano — dos bugs ao beta

Ordenado por dependência, não por vontade. A batalha ao vivo é o item mais
valioso da lista, mas depende de o estado da batalha estar confiável — e
hoje não está.

| # | Item | Onde | Situação |
|---|---|---|---|
| 1 | Carta do painel não entra na batalha | site + script | ✅ corrigido |
| 2 | Troca que trava sem resposta | bot | ✅ corrigido |
| 3 | Cancelar e expirar batalha e troca | bot | ✅ feito |
| 4 | Batalha ao vivo, turno a turno | bot | ✅ feito |
| 5 | `/treino` contra o BOT Caviar | bot | ✅ feito |
| 6 | Página de VIP no site | site | ✅ feito |
| 7 | Trocar "Entrar" por "Painel Admin" | site | ✅ feito |
| 8 | Ideias de produto e monetização | documento | pendente |

---

## 1. Carta do painel não entra na batalha ✅

**Corrigido nesta rodada.** A causa não era o `cardId`.

O bot grava pelo Mongoose, que gera um `_id` para cada item de array de
subdocumento automaticamente. O painel grava pelo driver nativo, que não
gera. As cartas do painel entravam sem `_id`.

E batalha, troca e mercado identificam a cópia por **`card._id`**, não por
`card.cardId`. Sem o campo, o botão da carta era montado com
`battle_pick_..._undefined`, e a busca `inventario.find(c => String(c._id) === cardId)`
nunca casava. Daí o "essa carta não está mais no seu inventário", com a
carta visivelmente na lista.

Foi por isso também que o script `npm run cards:grant` nunca deu problema:
ele passa por Mongoose.

**O que fazer agora:** as cartas já distribuídas continuam quebradas no
banco. Rode uma vez:

```bash
npm run reparar:inventario                 # mostra quantas estão quebradas
npm run reparar:inventario -- --confirmar  # conserta
```

**Dívida que isso revelou:** o código usa `_id` e `cardId` para a mesma
coisa, em lugares diferentes. Vale unificar em `cardId` depois — mas é
refatoração com dado em produção, não entra agora.

---

## 2. Troca que trava sem resposta

O que você viu: o AniBattle não responde a tempo, a troca fica presa e
nenhuma outra pode começar até você apagar o registro no banco.

Duas causas prováveis, que vão ser confirmadas antes de mexer:

- **A interação estoura os 3 segundos.** A mesa de troca carrega os dois
  inventários inteiros antes de responder. Com inventário grande e o Atlas
  com latência, passa do limite e o Discord descarta a interação.
- **Não existe varredura para trocas presas.** O torneio ganhou isso na
  rodada passada; a troca só tem `limparAbandonadas`, e vale a pena
  conferir se ela cobre a fase em que a sua travou.

**Solução:** `deferUpdate` antes de qualquer consulta ao banco, projeção
só dos campos usados, e varredura com prazo por fase — igual ao que foi
feito no torneio.

---

## 3. Cancelar e expirar batalha e troca

Regras, conforme você descreveu:

| Estado | Pode cancelar? | Quem |
|---|---|---|
| Convite enviado, ainda não aceito | sim | quem convidou, ou quem foi convidado (recusar) |
| Escolhendo cartas | sim | qualquer um dos dois |
| Batalha em execução | **não** | — |
| Concluída | **não** | — |
| Troca com os dois confirmados | **não** | — |

Cancelar devolve a aposta retida. O `battleState` já tem o `wagerHeld`
justamente para isso, então a devolução não é código novo — é ligar o que
existe.

**Prazos:** convite expira em 2 minutos, escolha de cartas em 5. Hoje o
sweep roda a cada 5 minutos, o que pode deixar uma batalha morta por até
10. Passa a agendar a expiração de cada uma.

---

## 4. Batalha ao vivo, turno a turno

O maior item, e o que mais muda a sensação do bot.

Hoje: `runBattle` resolve os três rounds em memória e cospe o resultado
pronto. O log turno a turno **já existe** — está em `result.rounds[].log`
e é descartado, menos duas linhas de destaque.

**A ideia:** em vez de gerar tudo e mostrar o fim, mostrar o log
progressivamente, editando a mesma mensagem no canal.

```
Round 1  ⚔️  Gojo  vs  Sukuna
██████████░░░░  Gojo   142/200
████░░░░░░░░░░  Sukuna  58/190

💥 Gojo atacou — 34 de dano
✨ CRÍTICO! Sukuna revidou — 71 de dano
🌀 Gojo esquivou
```

**Decisões técnicas que isso exige:**

- **Ritmo.** O Discord limita edições de mensagem por canal. Um tique a
  cada 2–3 segundos, com no máximo ~15 tiques, dá uma luta de 30 a 45
  segundos — perto do que o DreamTeam faz.
- **Só no servidor.** A escolha de cartas continua no privado (senão o
  oponente vê seu time), mas a luta acontece no canal, para os dois
  torcerem juntos. Hoje o resultado pode cair no privado de quem clicou
  por último.
- **O resultado é gravado ANTES da animação.** Isso é o ponto mais
  importante do desenho: se o bot cair no meio da luta, o resultado já
  está no banco, a aposta já foi resolvida e ninguém perde moeda. A
  animação é enfeite sobre um fato consumado — nunca a fonte da verdade.
- **Tela final** com placar, moedas ganhas, ELO, troféus desbloqueados.

---

## 5. `/treino` contra o BOT Caviar

Já desenhado, falta escrever:

- `utils/treino.js` — monta o time do BOT Caviar sorteando 3 cartas numa
  faixa de overall relativa à média do seu time (fácil / parelho / difícil).
- `/treino` usa suas 3 melhores por padrão, com botões "Lutar de novo" e
  "Trocar meu time".
- Reaproveita a batalha ao vivo do item 4 — por isso vem depois dele.

**A regra que não pode falhar:** treino não vale nada. `treinoRun.js` não
pode importar `progresso`, `elo`, `economy` nem `battleState`. Isso vira
verificação no `tests/convencoes.test.js`, no mesmo espírito do teste que
garante que nenhum plano VIP toca em combate.

---

## 6. Página de VIP no site

Comparativo dos quatro planos, o que cada um dá, e o que **nenhum** dá —
essa última parte vende mais do que parece, porque quem já se queimou com
bot pay-to-win procura exatamente isso.

Checkout via Mercado Pago (PIX), chamando o webhook que já existe no bot.
O webhook tem idempotência por `providerPaymentId`, então o caminho de
pagamento já está pronto do lado do bot.

---

## 7. "Entrar" → "Painel Admin"

Você tem razão: hoje o login não serve para nada além do admin. O botão
some para quem não é admin, e vira "Painel" para quem é.

Quando existir perfil público de jogador ou compra de VIP pelo site, o
login volta a fazer sentido para todo mundo — aí o botão volta.

---

## 8. Ideias

Documento à parte, sem código: produto, VIP e monetização.

---

## Ordem sugerida

```
2 e 3  (bugs de troca e batalha)        ← desbloqueia o resto
   ↓
4  (batalha ao vivo)                    ← o item que muda o jogo
   ↓
5  (/treino, reusa a batalha ao vivo)
   ↓
6 e 7  (site, independentes do bot)
   ↓
8  (ideias)
```

Os itens 6 e 7 não dependem de nada do bot — dá para intercalar quando
quiser variar.
