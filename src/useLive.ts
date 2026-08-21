import { useEffect, useState } from 'react'
import { supabase } from './supabase'

/**
 * Lê uma tabela e refaz a query inteira a cada mudança que o Postgres empurrar.
 *
 * Refazer o select em vez de aplicar o delta na lista: são dezenas de linhas, não
 * milhares, e elimina a classe de bug em que a tela discorda do banco.
 */
export function useLive<T>(
  table: string,
  houseId: string,
  load: () => PromiseLike<{ data: T[] | null; error: unknown }>,
) {
  const [rows, setRows] = useState<T[]>([])
  const [ready, setReady] = useState(false)

  // `load` é recriada a cada render, mas só depende de houseId — por isso as deps
  // são [table, houseId] e não [load]. Trocar de casa remonta a subscription.
  useEffect(() => {
    let alive = true
    const refresh = () =>
      load().then(({ data }) => {
        if (!alive) return
        setRows(data ?? [])
        setReady(true)
      })

    void refresh()
    const channel = supabase
      .channel(`${table}:${houseId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, () => void refresh())
      .subscribe()

    return () => {
      alive = false
      void supabase.removeChannel(channel)
    }
  }, [table, houseId])

  return { rows, ready }
}
