# Roadmap

Cada item tem um **gatilho**: o sinal real que justifica construir. Sem o gatilho, não
constrói. Funcionalidade que ninguém pediu vira código para manter e dado morto para olhar.

A ordem abaixo não é ordem de execução — é ordem de custo/benefício no dia em que o
gatilho aparecer.

## Agora

**Deploy na Vercel.** Passo a passo em [ARCHITECTURE.md](ARCHITECTURE.md#deploy). É o que
libera o teste real de PWA no celular e o convite para o resto da casa.

Junto no mesmo commit, porque depois ninguém volta para fazer:

- **Keepalive.** O Supabase pausa projeto free com 7 dias sem requisição. Uma GitHub Action
  com um `curl` duas vezes por semana resolve. ~12 linhas.

## Depois, por gatilho

| Gatilho | O que fazer | Custo |
|---|---|---|
| E-mail de confirmação ou de nova senha não chega | SMTP próprio (Resend free) no Supabase, e aí subir o rate limit em Authentication → Rate Limits | ~15 min |
| Alguém reclamou de algo quebrado no WhatsApp em vez do app | Módulo **melhorias da casa** | ~1 dia |
| Alguém disse "eu faço tudo sozinho aqui" | Tela de **histórico / quem fez o quê** | ~2 h |
| Tarefa recorrente sendo esquecida | **Push notification** | ~1 dia |
| Lista de compras usada há 1 mês sem falhar | Módulo **estoque** | ~1 dia |
| Alguém pediu para dividir uma conta | **Despesas** — ou mandar usar Splitwise | ~3 dias |
| Tentou adicionar item no mercado sem sinal | **Escrita offline** | ~2 dias |
| Alguém de fora quer usar | Abrir **multi-casa** | ~4 h |

### Notas por item

**Melhorias da casa** — tabela nova (`improvements`) com título, foto, status, mesma coluna
`household_id` e a mesma policy copiada. A foto exige Supabase Storage e um bucket com RLS;
é a única parte que não é cópia do que já existe.

**Histórico** — o mais barato da lista, porque o dado **já está lá**. Toda tarefa concluída
vira uma linha permanente com `done_by` e `done_at`; a recorrência cria uma nova em vez de
sobrescrever. Falta só uma tela contando por pessoa. Foi de graça por causa da decisão de
não ter tabela de completions.

**Push** — precisa de uma Edge Function no Supabase (para guardar a chave VAPID) e de
`web-push`. Não é backend: é uma função. No iOS só funciona se a pessoa instalou o app pela
tela inicial — mais um motivo para o deploy vir antes.

Junto com push vale **`pg_cron`** para o lembrete diário ("o lixo é hoje"). Roda dentro do
Postgres, não precisa de servidor.

**Estoque** — o módulo com maior chance de virar dado morto. Só funciona se todo mundo
atualizar ao consumir, e ninguém faz isso. Se for construir, construa ligado à lista de
compras: item que acaba no estoque entra na lista sozinho. Isolado, ele morre em duas semanas.

**Despesas** — o mais caro e o que mais gera discussão em casa compartilhada. Antes de
construir, pergunte se o Splitwise não resolve. Se resolver, resolveu.

**Escrita offline** — fila local (IndexedDB) + reconciliação na volta do sinal. É a
funcionalidade com pior relação custo/benefício da lista: caro de fazer, e o mercado da
esquina costuma ter sinal.

**Multi-casa** — o schema já suporta desde o primeiro dia. O trabalho é de interface:
seletor de casa e permitir estar em mais de uma.

## Dívida conhecida

Cantos cortados de propósito, com o teto de cada um. Nenhum é bug — todos são decisão
registrada no código.

| Onde | Limitação | Quando arrumar |
|---|---|---|
| ~~Tasks.tsx~~ | ~~Desmarcar tarefa recorrente não apaga a próxima ocorrência~~ | **resolvido** em [001](supabase/migrations/001-recorrencia-unica.sql) |
| [schema.sql](supabase/schema.sql) | Recorrência só `daily`/`weekly`/`monthly` | Quando pedirem "toda segunda e quinta" → RRULE |
| [Shopping.tsx](src/Shopping.tsx) | Itens comprados somem da tela após 2 dias | Provavelmente nunca; é o comportamento desejado |
| [schema.sql](supabase/schema.sql) | Qualquer morador apaga item de qualquer um | Se virar problema social, não técnico |
| [schema.sql](supabase/schema.sql) | Qualquer morador tira qualquer morador da casa | Idem — o dia em que doer, é uma coluna `role` e um `and` nas duas policies |
| [useLive.ts](src/useLive.ts) | Cada mudança refaz o `select` inteiro | Só se a lista passar de centenas de itens |
| Geral | Sem teste automatizado no cliente | Quando houver lógica de verdade fora do banco |

## Provavelmente nunca

Ideias que soam boas e não sobrevivem ao uso real numa casa de 3 pessoas: categorias de
item, ordenação por corredor do mercado, leitor de código de barras, integração com preço
de supermercado, gamificação de tarefas, chat interno (já existe o grupo do WhatsApp).

Se alguma virar pedido espontâneo de quem mora na casa, ela sai desta lista. Até lá, não.
