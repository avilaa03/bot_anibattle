# Plano de Beta — AniBattle

*Escrito em 02/08/2026, a partir de auditoria do repositório.*

Estado atual: 24 comandos, ~8.900 linhas, 5 arquivos de teste passando. O jogo funciona de ponta a ponta — rolar, colecionar, Pokédex, mercado, batalha com aposta, assinatura VIP.

O que falta não é código de jogo. É a camada de operação, uma decisão de arquitetura que ficou implícita, e as features que fazem alguém voltar amanhã.

---

## Fase 0 — Bloqueadores (fazer antes de convidar qualquer pessoa)

Nenhum destes é opcional. Estimativa total: **um fim de semana.**

### Segurança

| O quê | Por quê |
|---|---|
| Trocar a senha do MongoDB | Era `708090` — seis dígitos num cluster exposto à internet, varrido por bots o dia inteiro |
| Restringir IP allowlist no Atlas | Só o IP do VPS deve conseguir conectar |
| Regenerar o token do Discord | Ele já circulou em texto puro |
| Gerar `PAYMENT_WEBHOOK_SECRET` | `openssl rand -hex 32`. Sem ele o webhook fica desligado |

### Operação

- [ ] `npm run migrate:dex` — numera o catálogo (a `/ficha` depende disso)
- [ ] `npm run migrate:pokedex` — preenche a Pokédex de quem já tinha cartas
- [ ] `npm run preview:cards -- --molduras` — medir peso e tempo dos GIFs, ajustar `.env`
- [ ] Cron diário do `npm run backup`, com cópia **fora** do servidor
- [ ] Testar `npm run restore` uma vez num banco de teste
- [ ] `SENTRY_DSN` configurado
- [ ] PM2 ou systemd, para o bot reiniciar sozinho

### Jurídico

- [ ] Preencher os campos `[...]` em `PRIVACIDADE.md` e `TERMOS.md`
- [ ] Publicar os dois num lugar acessível e linkar no `/info`

---

## A decisão que precisa ser tomada agora

**A economia é global ou por servidor?**

Hoje é global — nenhum schema tem `guildId`. Um jogador tem o mesmo saldo, inventário e Pokédex em qualquer servidor.

O Mudae faz o contrário: cada servidor tem seu próprio "harém". Isso muda o jogo inteiro:

| | Global (hoje) | Por servidor (Mudae) |
|---|---|---|
| Sensação | Sua coleção te acompanha | Competição com quem está do seu lado |
| Mercado | Um mercado só, muita liquidez | Mercado por comunidade, mais social |
| Escassez | Nenhuma — todos podem ter tudo | Pode limitar "1 dono por carta por servidor" |
| Motivo de convidar o bot | Baixo (dá no mesmo onde jogar) | Alto (seu servidor tem sua economia) |

**Recomendação: manter global, mas adicionar competição por servidor** — rankings e eventos com escopo de servidor, sobre uma economia global. Você fica com o melhor dos dois e não precisa migrar dado nenhum.

Decidir isso **antes** do beta. Depois, com jogadores acumulando cartas, migrar de global para por servidor é doloroso e injusto com quem já jogou.

---

## ✅ Fase 1 — CONCLUÍDA em 02/08/2026

Todos os sistemas abaixo foram implementados. Detalhes técnicos em [ROADMAP.md](ROADMAP.md).

| Sistema | Comando | Situação |
|---|---|---|
| Troca carta-por-carta | `/trocar` | ✅ |
| Wishlist com notificação | `/desejar`, `/desejos` | ✅ |
| Streak diário | `/daily` | ✅ |
| Ranking de batalha (ELO) | `/ranking` | ✅ |
| Missões diárias e semanais | `/missoes` | ✅ |
| Conquistas estilo PSN | `/conquistas` | ✅ |
| Torneios | `/torneio` | ✅ |
| Eventos e cartas limitadas | — | ⏸️ adiado a pedido |

**Decisão tomada:** economia **global**. A ideia de competição por servidor (rankings e eventos com escopo local sobre economia global) fica guardada para depois — não exige migração de dado, então pode entrar a qualquer momento.

O texto original da fase fica abaixo como registro do raciocínio.

---

## Fase 1 — O que falta para o jogo ser divertido *(registro original)*

Auditoria: `wishlist`, `troca`, `torneio`, `conquista`, `missão`, `streak` — nenhum existe. E não há ranking de vitórias, só de moedas (`/magnata`) e de descobertas (`/colecionadores`).

Ordenado por **impacto sobre esforço**:

### 1. Troca direta carta-por-carta · esforço baixo, impacto alto

Hoje só existe venda via mercado, então trocar exige intermediar com moeda e confiar no outro. Um `/trocar @alguém` com proposta, contraproposta e confirmação dos dois lados é a feature mais pedida em qualquer bot de carta, e a mais social de todas.

Já existe quase tudo que precisa: escrow (do sistema de aposta), validação de posse (do `validarPosse`), e o padrão de confirmação por botões.

### 2. Wishlist com notificação · esforço médio, impacto muito alto

É o motor de retenção do Mudae. `/desejar Gojo` e, quando alguém rolar o Gojo naquele servidor, você é mencionado. Traz a pessoa de volta ao Discord sem você gastar nada com divulgação.

Dá para ir além: mostrar na `/ficha` quantos jogadores desejam aquela carta, o que cria valor percebido e aquece o mercado.

### 3. Streak diário · esforço baixo, impacto médio

O `/daily` hoje vale 0,22% do que rolar rende — ninguém tem motivo para usar. Transformar em sequência (dia 1: 50, dia 7: um roll extra, dia 30: carta garantida de raridade mínima) dá propósito a ele e cria o hábito de abrir o bot todo dia.

### 4. Ranking de batalha · esforço baixo, impacto médio

Existe `wins`/`losses` no perfil, mas nenhum ranking. Um `/ranking` com pontuação (ELO simples) dá sentido a batalhar além da moeda — hoje, ganhar duelo só rende dinheiro, e dinheiro já sobra.

### 5. Missões diárias e semanais · esforço médio, impacto alto

"Role 3 cartas", "vença 2 batalhas", "descubra 1 carta nova". É o que transforma sessão de 2 minutos em sessão de 15. Combina com o streak.

### 6. Eventos e cartas limitadas · esforço médio, impacto alto (e monetizável)

Carta de evento que só existe durante 2 semanas, com moldura própria. É o que gera FOMO saudável, dá motivo para voltar, e é o gancho mais natural para vender passe de evento — sem vender poder.

### 7. Conquistas · esforço médio, impacto médio

"Complete uma série inteira", "tenha 5 master", "vença 50 duelos". Dá objetivo de longo prazo para quem já tem tudo, e emblemas ficam bem no `/profile`.

---

## Fase 2 — O site

### Mesmo projeto ou separado?

**Separado**, compartilhando só o banco.

O bot precisa de um processo vivo 24/7 com WebSocket aberto no Discord. O site tem tráfego imprevisível e você vai querer publicar mudança nele toda semana. Juntando os dois: cada deploy do site derruba o bot, e um pico de acesso no site afeta quem está jogando.

```
bot_animefight (VPS, PM2)  ─┐
                            ├─→  MongoDB Atlas
anibattle-site (Vercel)    ─┘
```

O que **não** duplicar: as regras de negócio. O site nunca deve conceder VIP escrevendo direto no banco — deve chamar o webhook que já existe (`POST /webhook/pagamento`), que já é idempotente e já registra auditoria. Uma regra, um lugar.

### Ordem de construção

**2a. Site público** *(um fim de semana)*
Landing, notícias, catálogo de cartas navegável com filtro por raridade e série, página de planos, contato. Tudo leitura do mesmo Mongo. O catálogo fica ótimo porque você já tem o `cardBuilder` gerando a imagem.

**2b. Login com Discord OAuth2** *(1-2 dias)*
A decisão mais importante do site. Sem OAuth, o usuário precisa copiar e colar o próprio ID do Discord na hora de comprar — e uma parte grande vai errar, pagar, e virar suporte manual para você. Com OAuth você pega o ID automaticamente e o problema deixa de existir.

**2c. Checkout de VIP** *(1-2 dias)*
Mercado Pago com `external_reference` carregando `discordUserId:tier`. Quando aprova, o Mercado Pago chama o webhook que já está no bot. A única cola nova é um adaptador traduzindo o payload deles para o formato que o endpoint espera.

**2d. Painel administrativo** *(uma semana, feito com cuidado)*

Aqui mora o risco. Um painel que dá VIP e cartas é uma impressora de dinheiro exposta na internet. Três regras inegociáveis:

- Autenticação por Discord OAuth **restrita ao seu ID**, nunca senha compartilhada
- Toda ação administrativa gravada em log de auditoria: quem, quando, o quê, antes e depois
- Nenhuma ação destrutiva sem confirmação explícita

Comece **somente leitura** (dashboards, busca de jogador, histórico de pagamento) e só depois adicione escrita. Os scripts de terminal que já existem (`cards:grant`, `pokedex:grant`, `vip:grant`) cobrem a escrita com segurança enquanto isso.

---

## Sequência recomendada

```
Fase 0  ──→  BETA FECHADO  ──→  Fase 1 (1,2,3)  ──→  BETA ABERTO  ──→  Fase 2  ──→  Monetização
         20-50 pessoas                          divulgação em                    site + checkout
         1 servidor                             comunidades PT-BR
```

**Não pule o beta fechado.** Com 20-50 pessoas num servidor só, o que você precisa medir não é bug — é **quantos voltam no dia seguinte sem você pedir**. Se a resposta for baixa, divulgar mais cedo só queima a primeira impressão com um público que não volta.

Para medir isso você precisa de instrumentação mínima: quantos comandos por dia, quantos jogadores únicos por dia, quantos voltaram depois de 1 e 7 dias. Uma coleção `events` com `{userId, comando, data}` já responde tudo isso.

---

## O que eu faria primeiro, se fosse decidir

1. Fase 0 inteira (fim de semana)
2. Instrumentação de retenção (algumas horas)
3. Troca carta-por-carta + streak diário (dois dias)
4. Beta fechado
5. Wishlist, olhando os números do beta antes
