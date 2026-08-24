import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, type House } from './supabase'

export type Member = { user_id: string; display_name: string }

export function useHousehold() {
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(false)
  // O link de "esqueci a senha" volta com type=recovery no hash. Lido de forma
  // síncrona no primeiro render porque o supabase-js apaga o hash assim que troca o
  // token pela sessão — depois disso recuperação e login normal ficam idênticos, e a
  // pessoa cairia direto no app sem nunca escolher a senha nova.
  const [recovering, setRecovering] = useState(
    () => new URLSearchParams(location.hash.slice(1)).get('type') === 'recovery',
  )
  const [loaded, setLoaded] = useState(false)
  const [house, setHouse] = useState<House | null>(null)
  const [members, setMembers] = useState<Member[]>([])

  // onAuthStateChange já dispara INITIAL_SESSION no mount: uma fonte de verdade só,
  // sem corrida entre getSession() e o listener.
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      // Cinto e suspensório com a leitura do hash acima: o evento é o caminho normal,
      // mas ele dispara no _initialize() e pode chegar antes deste listener existir.
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
      setSession(s)
      setAuthReady(true)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const refresh = useCallback(async () => {
    if (!authReady) return
    if (!session) {
      setHouse(null)
      setMembers([])
      setLoaded(true)
      return
    }
    // Sem WHERE: a RLS é o filtro. Estas queries só devolvem a minha casa e quem mora nela.
    const [houses, mems] = await Promise.all([
      supabase.from('households').select('id, name, invite_code'),
      supabase.from('household_members').select('user_id, display_name'),
    ])
    setHouse((houses.data?.[0] as House | undefined) ?? null)
    setMembers((mems.data as Member[] | null) ?? [])
    setLoaded(true)
  }, [authReady, session])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const nameOf = useCallback(
    (id: string | null) => members.find((m) => m.user_id === id)?.display_name ?? 'alguém',
    [members],
  )

  return {
    session,
    ready: authReady && loaded,
    house,
    members,
    nameOf,
    refresh,
    recovering,
    // Sem useCallback: ninguém usa isto em array de dependência, e hook dentro do
    // objeto de retorno quebra no dia em que alguém puser um early return aí em cima.
    doneRecovering: () => setRecovering(false),
  }
}
