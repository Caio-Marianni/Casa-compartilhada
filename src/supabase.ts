import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !key) {
  throw new Error(
    'Copie .env.example para .env e preencha VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY ' +
      '(Supabase → Settings → API Keys).',
  )
}

// Janela de sessão longa de propósito: quem mora na casa não pode ser obrigado a
// digitar senha toda semana — é assim que um app doméstico morre.
//
// As três opções abaixo já são o padrão do supabase-js. Estão explícitas para que
// uma atualização de dependência não encurte a janela sem ninguém perceber.
//
// O prazo de verdade NÃO está aqui, e não é cookie: o token fica no localStorage
// deste aparelho e se renova sozinho. Quem define o limite é o painel —
// Supabase → Authentication → Sessions. Ver ARCHITECTURE.md § Sessão.
export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})

/**
 * O supabase-js não lança exceção: devolve `{ data, error }`. Sem isto, um erro
 * (RLS, rede, linha já apagada por outra pessoa) some sem deixar rastro e o
 * usuário só vê a tela não responder.
 *
 * Devolve true se deu certo, para o chamador desfazer a atualização otimista.
 */
export async function run(
  query: PromiseLike<{ error: { message: string } | null }>,
  onErro: (msg: string) => void,
): Promise<boolean> {
  const { error } = await query
  if (error) onErro(error.message)
  return !error
}

// Tipos escritos à mão: são 3 tabelas. Se um dia virarem 10, gere com
// `supabase gen types typescript` em vez de manter isto sincronizado na cabeça.
export type House = { id: string; name: string; invite_code: string }

export type Item = {
  id: string
  household_id: string
  name: string
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
