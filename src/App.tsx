import { useState } from 'react'
import { Login, NovaSenha, Onboarding } from './Auth'
import { Household } from './Household'
import { Shopping } from './Shopping'
import { Tasks } from './Tasks'
import { useHousehold } from './useHousehold'

const ABAS = ['compras', 'tarefas', 'casa'] as const

export default function App() {
  const { session, ready, house, members, nameOf, refresh, recovering, doneRecovering } =
    useHousehold()
  // Três telas não precisam de router: uma URL só, e o botão voltar do celular
  // continua fazendo o que o usuário espera (sair do app).
  const [tab, setTab] = useState<(typeof ABAS)[number]>('compras')
  const [erro, setErro] = useState<string | null>(null)

  if (!ready) return <p className="label p-8 text-center">carregando…</p>
  // Antes do !session de propósito: numa recuperação a sessão JÁ existe, e sem esta
  // linha a pessoa entraria no app com a senha antiga ainda valendo.
  if (recovering) return <NovaSenha onDone={doneRecovering} />
  if (!session) return <Login />
  if (!house) return <Onboarding onDone={refresh} />

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      {erro && (
        <button
          onClick={() => setErro(null)}
          className="fixed inset-x-0 top-0 z-50 bg-danger px-4 py-3 text-left text-sm text-bg backdrop-blur"
        >
          {erro}
          <span className="ml-2 opacity-60">· toque para fechar</span>
        </button>
      )}

      <header className="px-4 pb-3 pt-[calc(1rem+env(safe-area-inset-top))]">
        {/* Convite e "sair" moraram aqui até existir a aba casa; lá eles cabem melhor. */}
        {/* 22px de Farday tem a altura de maiúscula de uns 30px de sans — a fonte
            é que faz o peso aqui, não o tamanho. */}
        <h1 className="display text-[22px]">{house.name}</h1>
      </header>

      {/* Aba sublinhada em vez de pílula: a régua é o gesto que os dois sites usam
          no lugar de sombra, e sobra contraste para o coral marcar onde você está. */}
      <nav className="mx-4 mb-4 flex gap-5 border-b-2 border-rule">
        {ABAS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`label -mb-0.5 border-b-2 pb-2 ${
              tab === t ? 'border-acc text-acc' : 'border-transparent'
            }`}
          >
            {t}
          </button>
        ))}
      </nav>

      {tab === 'compras' && (
        <Shopping houseId={house.id} me={session.user.id} nameOf={nameOf} onErro={setErro} />
      )}
      {tab === 'tarefas' && (
        <Tasks
          houseId={house.id}
          me={session.user.id}
          members={members}
          nameOf={nameOf}
          onErro={setErro}
        />
      )}
      {tab === 'casa' && (
        <Household
          house={house}
          members={members}
          me={session.user.id}
          email={session.user.email}
          onErro={setErro}
          refresh={refresh}
        />
      )}
    </div>
  )
}
