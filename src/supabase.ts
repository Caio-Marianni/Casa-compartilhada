import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !key) {
  throw new Error(
    'Copie .env.example para .env e preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY ' +
      '(Supabase → Settings → API).',
  )
}

export const supabase = createClient(url, key)

// Tipos escritos à mão: são 3 tabelas. Se um dia virarem 10, gere com
// `supabase gen types typescript` em vez de manter isto sincronizado na cabeça.
export type House = { id: string; name: string; invite_code: string }

export type Item = {
  id: string
  household_id: string
  name: string
  qty: string | null
  added_by: string
  bought_at: string | null
  bought_by: string | null
  created_at: string
}

export type Recurrence = 'daily' | 'weekly' | 'monthly'

export type Task = {
  id: string
  household_id: string
  title: string
  assignee: string | null
  due_date: string | null
  recurrence: Recurrence | null
  done_at: string | null
  done_by: string | null
  created_at: string
}
