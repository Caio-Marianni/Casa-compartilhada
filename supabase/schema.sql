-- ============================================================
-- Casa Compartilhada — schema v1
--
-- Cole inteiro no SQL Editor do Supabase e rode UMA vez.
-- Depois rode check.sql para conferir.
-- (Rodar de novo dá erro de "already exists" — de propósito: nenhum
--  DROP aqui, para não existir um arquivo capaz de apagar a casa.)
-- ============================================================

-- ---------- casa e moradores ----------

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

-- Toda política de RLS deste arquivo passa por aqui. security definer ignora as
-- políticas, o que quebra a recursão infinita de "para ler membros preciso ler membros".
create or replace function my_households() returns setof uuid
language sql stable security definer set search_path = public as $$
  select household_id from household_members where user_id = auth.uid()
$$;

-- ---------- lista de compras ----------

create table shopping_items (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name         text not null check (length(trim(name)) > 0),
  qty          text,                                   -- texto livre: "2 caixas", "1 kg"
  added_by     uuid not null default auth.uid() references auth.users(id),
  bought_at    timestamptz,                            -- null = pendente
  bought_by    uuid references auth.users(id),
  created_at   timestamptz not null default now()
);
create index on shopping_items (household_id, bought_at);

-- ---------- tarefas ----------

create table tasks (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  title        text not null check (length(trim(title)) > 0),
  assignee     uuid references auth.users(id),         -- null = qualquer um da casa
  due_date     date,
  recurrence   text check (recurrence in ('daily','weekly','monthly')),
  done_at      timestamptz,                            -- null = pendente
  done_by      uuid references auth.users(id),
  created_at   timestamptz not null default now()
);
create index on tasks (household_id, done_at, due_date);

-- Concluir tarefa recorrente cria a próxima linha; a antiga fica como histórico.
-- Sem cron job, sem tabela de completions.
-- ponytail: recorrência é uma string de 3 valores. Se precisar de "toda segunda e
-- quinta", troque por RRULE numa coluna jsonb — só este arquivo muda.
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
            -- feito em dia: mantém o ritmo (terça continua terça).
            -- feito com semanas de atraso: rola para hoje, em vez de empilhar
            -- ocorrências vencidas que geram outras ocorrências vencidas.
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
-- Para "só quem criou apaga", separe em policies for select/insert/update e
-- adicione uma for delete using (added_by = auth.uid()).
create policy "itens da minha casa" on shopping_items
  for all using  (household_id in (select my_households()))
      with check (household_id in (select my_households()));

create policy "tarefas da minha casa" on tasks
  for all using  (household_id in (select my_households()))
      with check (household_id in (select my_households()));

-- O Supabase normalmente já concede isso por default privileges; explícito aqui
-- para o app não morrer com "permission denied" num projeto configurado diferente.
grant select, insert, update, delete on households, household_members, shopping_items, tasks
  to authenticated;

-- ---------- entrar na casa ----------
-- Não existe policy de INSERT em households nem household_members: a única porta
-- de entrada são estas duas funções, e uma delas exige o código de convite.

create or replace function create_household(house_name text, display_name text)
returns households
language plpgsql security definer set search_path = public as $$
declare h households;
begin
  if auth.uid() is null then raise exception 'precisa estar logado'; end if;
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
  if auth.uid() is null then raise exception 'precisa estar logado'; end if;
  select id into h from households where invite_code = lower(trim(code));
  if h is null then raise exception 'código de convite inválido'; end if;
  insert into household_members (household_id, user_id, display_name)
  values (h, auth.uid(), display_name)
  on conflict (household_id, user_id) do update set display_name = excluded.display_name;
  return h;
end $$;

-- ---------- tempo real ----------
-- Realtime respeita RLS: cada celular só recebe mudança da própria casa.
alter publication supabase_realtime add table shopping_items, tasks;
