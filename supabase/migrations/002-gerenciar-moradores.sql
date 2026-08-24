-- ============================================================
-- 002 — gerenciar moradores
--
-- A tela de casa precisa de duas coisas que a RLS v1 não permitia:
--   1. renomear a si mesmo (não havia policy de UPDATE em household_members);
--   2. remover outro morador (o DELETE era só da própria linha).
--
-- Sem papéis de admin: qualquer morador remove qualquer morador. É a mesma
-- decisão que já vale para itens e tarefas — casa não é empresa, e uma casa de
-- 3 pessoas não sustenta uma tabela de permissões.
-- ponytail: se um dia doer, é uma coluna `role` em household_members e um
-- `and exists (... role = 'owner')` nas duas policies abaixo. Só este arquivo muda.
--
-- Cole no SQL Editor do Supabase e rode uma vez. Depois rode check.sql.
-- (Já está incorporado no schema.sql, para instalações novas.)
-- ============================================================

-- ---------- 1. nome vazio não entra ----------
-- O cliente manda o que quiser; as outras tabelas já barram isso na coluna.
alter table household_members
  add constraint household_members_display_name_check
  check (length(trim(display_name)) > 0);

-- ---------- 2. eu mudo o meu nome, e só o meu ----------
create policy "eu mudo meu nome" on household_members
  for update using      (user_id = auth.uid())
              with check (user_id = auth.uid());

-- ---------- 3. morador remove morador (inclusive a si mesmo) ----------
drop policy if exists "só eu saio da casa" on household_members;
create policy "morador remove morador" on household_members
  for delete using (household_id in (select my_households()));
