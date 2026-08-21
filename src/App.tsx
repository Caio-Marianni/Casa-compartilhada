import { useState } from 'react'
import { Login, Onboarding } from './Auth'
import { Shopping } from './Shopping'
import { Tasks } from './Tasks'
import { supabase } from './supabase'
import { useHousehold } from './useHousehold'

export default function App() {
  const { session, ready, house, members, nameOf, refresh } = useHousehold()
  // Duas telas não precisam de router: uma URL só, e o botão voltar do celular
  // continua fazendo o que o usuário espera (sair do app).
  const [tab, setTab] = useState<'compras' | 'tarefas'>('compras')
  const [copiado, setCopiado] = useState(false)

  if (!ready) return <p className="p-8 text-center text-slate-500">carregando…</p>
  if (!session) return <Login />
  if (!house) return <Onboarding onDone={refresh} />

  function copiarCodigo() {
    void navigator.clipboard.writeText(house!.invite_code)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 1500)
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      <header className="flex items-center gap-3 px-4 pb-3 pt-[calc(1rem+env(safe-area-inset-top))]">
        <div className="flex-1">
          <h1 className="text-lg font-semibold leading-tight">{house.name}</h1>
          <button onClick={copiarCodigo} className="text-xs text-slate-500">
            {copiado ? 'código copiado!' : `convite: ${house.invite_code} · copiar`}
          </button>
        </div>
        <button
          onClick={() => void supabase.auth.signOut()}
          className="text-sm text-slate-500"
        >
          sair
        </button>
      </header>

      <nav className="mx-4 mb-4 flex gap-1 rounded-xl bg-slate-900 p-1 text-sm">
        {(['compras', 'tarefas'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-lg py-2 capitalize ${
              tab === t ? 'bg-slate-800 font-medium text-slate-100' : 'text-slate-400'
            }`}
          >
            {t}
          </button>
        ))}
      </nav>

      {tab === 'compras' ? (
        <Shopping houseId={house.id} me={session.user.id} nameOf={nameOf} />
      ) : (
        <Tasks houseId={house.id} me={session.user.id} members={members} nameOf={nameOf} />
      )}
    </div>
  )
}
