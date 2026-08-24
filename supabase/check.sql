-- ============================================================
-- Casa Compartilhada — verificação do schema
--
-- Cole no SQL Editor do Supabase e rode DEPOIS do schema.sql.
--
-- RESULTADO ESPERADO: um erro vermelho dizendo
--   "TODOS OS CHECKS PASSARAM (rollback proposital, nada foi gravado)"
-- Esse erro é o sucesso: ele existe para desfazer os dados de teste.
-- Qualquer OUTRA mensagem = algo está quebrado.
--
-- Pode rodar quantas vezes quiser: nada é gravado no banco.
-- ============================================================

do $$
declare
  ana    uuid := gen_random_uuid();
  bruno  uuid := gen_random_uuid();
  casa_a uuid;
  casa_b uuid;
  t      uuid;
  n      int;
  d      date;
begin
  -- cenário: Ana mora na Casa A, Bruno mora na Casa B
  insert into auth.users (id, email)
    values (ana, 'ana@check.local'), (bruno, 'bruno@check.local');
  insert into households (name) values ('Casa A') returning id into casa_a;
  insert into households (name) values ('Casa B') returning id into casa_b;
  insert into household_members (household_id, user_id, display_name)
    values (casa_a, ana, 'Ana'), (casa_b, bruno, 'Bruno');

  -- 1. tarefa semanal concluída em dia gera UMA próxima ocorrência, 7 dias depois
  insert into tasks (household_id, title, due_date, recurrence)
    values (casa_a, 'Lixo', current_date, 'weekly') returning id into t;
  update tasks set done_at = now(), done_by = ana where id = t;

  select count(*), min(due_date) into n, d
    from tasks where household_id = casa_a and title = 'Lixo' and done_at is null;
  assert n = 1, 'recorrência: esperava 1 próxima ocorrência, veio ' || n;
  assert d = current_date + 7, 'recorrência: próxima deveria cair em 7 dias, veio ' || d;

  -- 2. tarefa sem recorrência não se multiplica
  insert into tasks (household_id, title)
    values (casa_a, 'Trocar lâmpada') returning id into t;
  update tasks set done_at = now(), done_by = ana where id = t;

  select count(*) into n
    from tasks where household_id = casa_a and title = 'Trocar lâmpada';
  assert n = 1, 'tarefa avulsa não deveria gerar outra, viraram ' || n;

  -- 3. concluída com 3 semanas de atraso: a próxima não pode nascer vencida
  insert into tasks (household_id, title, due_date, recurrence)
    values (casa_a, 'Faxina', current_date - 21, 'weekly') returning id into t;
  update tasks set done_at = now(), done_by = ana where id = t;

  select min(due_date) into d
    from tasks where household_id = casa_a and title = 'Faxina' and done_at is null;
  assert d >= current_date, 'recorrência atrasada nasceu no passado: ' || d;

  -- 4. desmarcar e remarcar não multiplica ocorrência.
  --    (bug real: 3 linhas idênticas de "Comer · toda semana · 30/08" na tela)
  insert into tasks (household_id, title, due_date, recurrence)
    values (casa_a, 'Comer', current_date, 'weekly') returning id into t;

  update tasks set done_at = now(), done_by = ana where id = t;   -- conclui: gera a próxima
  select count(*) into n from tasks where household_id = casa_a and title = 'Comer';
  assert n = 2, 'concluir deveria deixar 2 linhas (feita + próxima), tem ' || n;

  update tasks set done_at = null, done_by = null where id = t;   -- desmarca: leva a próxima junto
  select count(*) into n from tasks where household_id = casa_a and title = 'Comer';
  assert n = 1, 'desmarcar deveria remover a ocorrência gerada, sobraram ' || n;

  update tasks set done_at = now(), done_by = ana where id = t;   -- conclui de novo
  update tasks set done_at = null, done_by = null where id = t;
  update tasks set done_at = now(), done_by = ana where id = t;
  select count(*) into n
    from tasks where household_id = casa_a and title = 'Comer' and done_at is null;
  assert n = 1, 'depois de 3 idas e voltas deveria haver 1 pendente, tem ' || n;

  -- 5. o teste que mais importa: RLS furada é vazamento de dados, não bug de tela.
  --    A partir daqui a sessão é o Bruno (Casa B) e as políticas valem.
  insert into shopping_items (household_id, name, added_by) values (casa_a, 'Café', ana);

  perform set_config('request.jwt.claims', json_build_object('sub', ana)::text, true);
  perform set_config('role', 'authenticated', true);

  assert (select count(*) from shopping_items where household_id = casa_a) = 1,
    'Ana não consegue ler a lista da própria casa (RLS bloqueando demais)';

  perform set_config('request.jwt.claims', json_build_object('sub', bruno)::text, true);

  select count(*) into n from shopping_items where household_id = casa_a;
  assert n = 0, 'VAZAMENTO: Bruno leu ' || n || ' item(ns) da casa da Ana';

  select count(*) into n from households where id = casa_a;
  assert n = 0, 'VAZAMENTO: Bruno leu a casa da Ana';

  select count(*) into n from household_members where household_id = casa_a;
  assert n = 0, 'VAZAMENTO: Bruno leu os moradores da casa da Ana';


  -- 6. moradores: quem é de fora não remove nem renomeia quem mora aqui
  --    (a sessão ainda é o Bruno, da Casa B)
  delete from household_members where household_id = casa_a and user_id = ana;
  update household_members set display_name = 'invadido'
    where household_id = casa_a and user_id = ana;

  perform set_config('role', 'postgres', true);
  select count(*) into n from household_members
    where household_id = casa_a and user_id = ana and display_name = 'Ana';
  assert n = 1, 'VAZAMENTO: Bruno mexeu no morador da casa da Ana';

  -- 7. dentro da casa: cada um muda o próprio nome, e só o próprio.
  --    Bruno passa a morar também na Casa A; a sessão volta a ser a Ana.
  insert into household_members (household_id, user_id, display_name)
    values (casa_a, bruno, 'Bruno');
  perform set_config('request.jwt.claims', json_build_object('sub', ana)::text, true);
  perform set_config('role', 'authenticated', true);

  update household_members set display_name = 'Aninha'
    where household_id = casa_a and user_id = ana;
  update household_members set display_name = 'hackeado'
    where household_id = casa_a and user_id = bruno;

  perform set_config('role', 'postgres', true);
  select count(*) into n from household_members
    where household_id = casa_a
      and ((user_id = ana   and display_name = 'Aninha')
        or (user_id = bruno and display_name = 'Bruno'));
  assert n = 2, 'renomear: era para valer só para si mesmo (bateu ' || n || ' de 2)';

  -- 8. nome em branco o banco recusa, venha de onde vier
  begin
    update household_members set display_name = '   '
      where household_id = casa_a and user_id = ana;
    assert false, 'nome só de espaços deveria ser recusado pelo banco';
  exception when check_violation then null;
  end;

  -- 9. morador remove morador da própria casa (não existe papel de admin)
  perform set_config('request.jwt.claims', json_build_object('sub', ana)::text, true);
  perform set_config('role', 'authenticated', true);
  delete from household_members where household_id = casa_a and user_id = bruno;

  perform set_config('role', 'postgres', true);
  select count(*) into n from household_members
    where household_id = casa_a and user_id = bruno;
  assert n = 0, 'Ana não removeu Bruno da própria casa (RLS bloqueando demais)';

  raise exception 'TODOS OS CHECKS PASSARAM (rollback proposital, nada foi gravado)';
end $$;
