-- ============================================================
-- 002 — quantidade vira parte do nome
--
-- O campo "qtd" era um input separado de 80px ao lado do nome. Na prática
-- ninguém usa: a pessoa digita "2 caixas de leite" no campo do nome e ignora
-- o outro. Um campo a menos é uma decisão a menos na hora de adicionar.
--
-- Junta o que já existe antes de remover a coluna: nenhum dado se perde.
--
-- Cole no SQL Editor e rode uma vez. (Já incorporado no schema.sql.)
-- ============================================================

update shopping_items
   set name = name || ' (' || trim(qty) || ')'
 where qty is not null
   and trim(qty) <> '';

alter table shopping_items drop column qty;
