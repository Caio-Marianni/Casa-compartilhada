import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'

/**
 * Lê uma tabela e refaz a query inteira a cada mudança que o Postgres empurrar.
 *
 * Refazer o select em vez de aplicar o delta: são dezenas de linhas, não milhares,
 * e elimina a classe de bug em que a tela discorda do banco.
 *
 * Devolve `setRows` e `refresh` para a tela poder atualizar na hora (otimista) e
 * voltar atrás com a verdade do servidor se a escrita falhar.
 */
export function useLive<T>(
  table: string,
  houseId: string,
  load: () => PromiseLike<{ data: T[] | null; error: unknown }>,
) {
  const [rows, setRows] = useState<T[]>([])
  const [ready, setReady] = useState(false)

  // `load` é recriada a cada render; o ref mantém `refresh` estável (deps vazias)
  // sem congelar uma closure velha.
  const loadRef = useRef(load)
  loadRef.current = load

  const refresh = useCallback(async () => {
    const { data } = await loadRef.current()
    setRows(data ?? [])
    setReady(true)
  }, [])

  useEffect(() => {
    void refresh()
    const channel = supabase
      .channel(`${table}:${houseId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, () => void refresh())
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [table, houseId, refresh])

  return { rows, ready, setRows, refresh }
}
