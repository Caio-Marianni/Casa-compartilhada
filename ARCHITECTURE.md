# Casa Compartilhada — arquitetura v1

App para a convivência de uma casa: lista de compras e tarefas compartilhadas.
PWA mobile-first + Supabase. Custo: R$ 0 (free tier dos dois).

## Decisões

| Assunto | Escolha | Por quê |
|---|---|---|
| Frontend | Vite + React + TypeScript | Um comando cria, build rápido, zero config de servidor. |
| PWA | `vite-plugin-pwa` (autoUpdate) | Instalável no celular, sem loja de app, sem build nativo. |
| Estilo | Tailwind | Mobile-first sai direto na marcação. Alternativa mais preguiçosa: CSS puro num `app.css` — dá conta de listas. |
| Estado | `useState` + realtime do Supabase | O servidor empurra a mudança; não há cache para sincronizar. Sem Redux/Zustand/TanStack Query. |
| Backend | Supabase (Postgres + Auth + Realtime) | Banco, login, tempo real e regras de acesso sem servidor para manter. |
| Login | Magic link por e-mail | Ninguém esquece senha, você não guarda hash de ninguém. |
| Entrada na casa | Código de convite (`join_household`) | Você não precisa cadastrar gente na mão para sempre. |
| Deploy | Vercel (ou Netlify), free | `git push` publica. |
| Multi-casa | Coluna `household_id` desde já, produto de uma casa só | Virar multi-casa depois não exige migração — só telas. |

**Não vai ter em v1 (de propósito):** estoque, melhorias da casa, divisão de despesas, push
notification, escrita offline, papéis/permissões. Nada disso muda o schema abaixo — são
tabelas novas ou tela nova.

## Estrutura de arquivos (a meta é ~8 arquivos)

```
src/
  main.tsx          bootstrap
  App.tsx           roteamento por aba (compras | tarefas), sem router
  supabase.ts       cliente
  useHousehold.ts   sessão + qual casa + nome dos membros
  Shopping.tsx      lista de compras
  Tasks.tsx         tarefas
supabase/
  schema.sql        tabelas + RLS + funções
  check.sql         asserts (ver "Verificação")
```

Sem `components/ui/`, sem `features/`, sem camada de service/repository. A tela chama o
Supabase direto.

## Modelo de dados

Duas ideias sustentam tudo:

1. **`bought_at` / `done_at` no lugar de coluna `status`.** Nulo = pendente, preenchido =
   feito, e já vem com quando e por quem. Uma coluna a menos e nenhum estado inválido.
2. **Tarefa recorrente concluída gera a próxima linha.** A linha antiga fica como histórico
   (dá "quem fez mais faxina" de graça, sem tabela de completions e sem cron job).

```sql
-- ============================================================
-- Casa Compartilhada — schema v1
-- ============================================================

create table households (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  invite_code text not null unique default encode(gen_random_bytes(4), 'hex'),
  created_at  timestamptz not null default now()
);

create table household_members (
  household_id uuid not null references households(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  joined_at    timestamptz not null default now(),
  primary key (household_id, user_id)
);

-- Quebra a recursão de RLS: security definer ignora as políticas.
-- Toda política abaixo passa por aqui.
create or replace function my_households() returns setof uuid
language sql stable security definer set search_path = public as $$
  select household_id from household_members where user_id = auth.uid()
$$;

create table shopping_items (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name         text not null check (length(trim(name)) > 0),
  qty          text,                                    -- texto livre: "2 caixas", "1 kg"
  added_by     uuid not null default auth.uid() references auth.users(id),
  bought_at    timestamptz,                             -- null = pendente
  bought_by    uuid references auth.users(id),
  created_at   timestamptz not null default now()
);
create index on shopping_items (household_id, bought_at);

create table tasks (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  title        text not null check (length(trim(title)) > 0),
  assignee     uuid references auth.users(id),          -- null = qualquer um da casa
  due_date     date,
  recurrence   text check (recurrence in ('daily','weekly','monthly')),
  done_at      timestamptz,
  done_by      uuid references auth.users(id),
  created_at   timestamptz not null default now()
);
create index on tasks (household_id, done_at, due_date);

-- ---------- recorrência ----------
-- ponytail: recorrência é uma string de 3 valores, não RRULE. Se um dia precisar
-- de "toda segunda e quinta", troque por rrule + uma coluna jsonb.
create or replace function spawn_next_occurrence() returns trigger
language plpgsql as $$
declare step interval;
begin
  if new.done_at is not null and old.done_at is null and new.recurrence is not null then
    step := case new.recurrence
              when 'daily'   then interval '1 day'
              when 'weekly'  then interval '7 days'
              when 'monthly' then interval '1 month'
            end;
    insert into tasks (household_id, title, assignee, due_date, recurrence)
    values (new.household_id, new.title, new.assignee,
            -- mantém o dia da semana quando feito em dia; se atrasou muito,
            -- rola para hoje em vez de empilhar ocorrências no passado
            greatest(coalesce(new.due_date, current_date) + step, current_date)::date,
            new.recurrence);
  end if;
  return new;
end $$;

create trigger tasks_recurrence after update on tasks
  for each row execute function spawn_next_occurrence();

-- ---------- RLS ----------
alter table households        enable row level security;
alter table household_members enable row level security;
alter table shopping_items    enable row level security;
alter table tasks             enable row level security;

create policy "membro lê a casa" on households
  for select using (id in (select my_households()));

create policy "membro vê os outros membros" on household_members
  for select using (household_id in (select my_households()));

create policy "só eu saio da casa" on household_members
  for delete using (user_id = auth.uid());

-- Casa não é empresa: quem mora edita e apaga qualquer item. Decisão consciente.
create policy "itens da minha casa" on shopping_items
  for all using   (household_id in (select my_households()))
      with check  (household_id in (select my_households()));

create policy "tarefas da minha casa" on tasks
  for all using   (household_id in (select my_households()))
      with check  (household_id in (select my_households()));

-- ---------- entrada na casa ----------
-- Insert em households/household_members só por aqui: sem política de insert,
-- ninguém se enfia numa casa sem o código.
create or replace function create_household(house_name text, display_name text)
returns households
language plpgsql security definer set search_path = public as $$
declare h households;
begin
  insert into households (name) values (house_name) returning * into h;
  insert into household_members (household_id, user_id, display_name)
  values (h.id, auth.uid(), display_name);
  return h;
end $$;

create or replace function join_household(code text, display_name text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare h uuid;
begin
  select id into h from households where invite_code = lower(trim(code));
  if h is null then raise exception 'código de convite inválido'; end if;
  insert into household_members (household_id, user_id, display_name)
  values (h, auth.uid(), display_name)
  on conflict (household_id, user_id) do update set display_name = excluded.display_name;
  return h;
end $$;

-- ---------- tempo real ----------
alter publication supabase_realtime add table shopping_items, tasks;
```

## Fluxo do app

**Primeiro acesso:** magic link → `useHousehold` consulta `household_members`. Sem casa →
tela única com "criar casa" ou "entrar com código" + nome de exibição. Com casa → app.

**Tela de compras:** `select * from shopping_items where bought_at is null` no topo,
comprados de hoje colapsados embaixo. Input fixo no rodapé (alcance do dedo). Tocar no item
marca comprado — `update ... set bought_at = now(), bought_by = auth.uid()`. Undo = setar
`bought_at = null`, sem lixeira.

**Tela de tarefas:** pendentes ordenadas por `due_date` (atrasadas em destaque), concluídas
dos últimos 7 dias embaixo. Concluir dispara o trigger e a próxima ocorrência aparece pelo
realtime, sem código no cliente.

**Realtime:** um `supabase.channel()` por tela, `on('postgres_changes')` → refaz o
`select`. Refazer a query inteira em vez de aplicar o delta na lista: a lista tem dezenas de
itens, não milhares, e elimina a classe de bug de estado divergente.

## Como rodar

```bash
npm install                       # já feito
cp .env.example .env              # e preencha URL + anon key
npm run dev                       # http://localhost:5173
npm run build                     # type-check + build de produção
```

No celular, na mesma rede: `npm run dev -- --host` e abra o IP que ele mostrar.
O magic link precisa ser aberto **no mesmo aparelho** onde você pediu o login.

## Fases

| Fase | Entrega | Estado |
|---|---|---|
| 0 | `schema.sql` + `check.sql` | escritos — falta rodar no SQL Editor |
| 1 | Login por magic link + criar/entrar na casa | pronto |
| 2 | Lista de compras + realtime | pronto |
| 3 | Tarefas + recorrência | pronto |
| 4 | PWA (manifest + ícones) | pronto — falta o deploy |

Tudo de 1 a 4 compila (`npm run build` passa), mas nada foi exercitado contra um
banco de verdade ainda: o primeiro `npm run dev` com `.env` preenchido é o teste real.

Depois disso, e só se a casa estiver realmente usando: estoque, melhorias, push, despesas.
Módulo que ninguém abre é dado morto — estoque é o candidato mais provável a isso, por isso
ficou fora do v1.

## Verificação

`supabase/check.sql` — um arquivo, uns poucos `assert`, roda no SQL editor:

- tarefa `weekly` concluída gera exatamente uma próxima ocorrência, na data certa;
- tarefa concluída sem `recurrence` não gera nada;
- concluir com 3 semanas de atraso não cria tarefa com data no passado;
- usuário da casa B não lê `shopping_items` da casa A (o teste que importa: RLS furada é
  vazamento de dados, não bug de tela).

Sem framework de teste, sem CI. Se um dia houver lógica de verdade no cliente, aí entra
um `vitest`.
