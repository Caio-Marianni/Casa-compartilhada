-- ============================================================
-- 001 — uma ocorrência aberta por tarefa recorrente
--
-- Problema: desmarcar uma tarefa concluída e concluí-la de novo gerava uma
-- ocorrência nova a cada volta. A lista enchia de linhas idênticas.
--
-- Cole no SQL Editor do Supabase e rode uma vez. Depois rode check.sql.
-- (Já está incorporado no schema.sql, para instalações novas.)
-- ============================================================

-- ---------- 1. limpa as duplicatas que o bug já criou ----------
-- Mantém a mais antiga de cada grupo.
delete from tasks a using tasks b
where a.done_at is null
  and b.done_at is null
  and a.recurrence is not null
  and a.household_id = b.household_id
  and a.title        = b.title
  and a.recurrence   = b.recurrence
  and (a.created_at, a.id) > (b.created_at, b.id);

-- ---------- 2. concluir não gera ocorrência se já houver uma aberta ----------
create or replace function spawn_next_occurrence() returns trigger
language plpgsql as $$
declare step interval;
begin
  if new.done_at is not null and old.done_at is null and new.recurrence is not null then

    -- Já existe uma ocorrência aberta desta mesma tarefa? Não cria outra.
    -- É o que impede a multiplicação quando alguém desmarca e remarca.
    if exists (
      select 1 from tasks
      where household_id = new.household_id
        and title        = new.title
        and recurrence   = new.recurrence
        and done_at is null
        and id <> new.id
    ) then
      return new;
    end if;

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

-- ---------- 3. desmarcar desfaz o efeito da conclusão ----------
-- Concluir gerou uma ocorrência; desmarcar tem que levá-la junto, senão sobra
-- órfã na lista. BEFORE, para a linha desmarcada voltar a ser a única pendente.
create or replace function unspawn_occurrence() returns trigger
language plpgsql as $$
begin
  if new.done_at is null and old.done_at is not null and new.recurrence is not null then
    delete from tasks
    where household_id = new.household_id
      and title        = new.title
      and recurrence   = new.recurrence
      and done_at is null
      and id <> new.id;
  end if;
  return new;
end $$;

drop trigger if exists tasks_unrecurrence on tasks;
create trigger tasks_unrecurrence before update on tasks
  for each row execute function unspawn_occurrence();
