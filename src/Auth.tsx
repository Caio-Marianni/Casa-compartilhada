import { useState, type FormEvent, type ReactNode } from 'react'
import { supabase } from './supabase'

/** Login por magic link: ninguém esquece senha e não guardamos hash de ninguém. */
export function Login() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    })
    setBusy(false)
    if (error) setError(error.message)
    else setSent(true)
  }

  return (
    <Centered title="Casa Compartilhada" subtitle="Compras e tarefas de quem mora junto.">
      {sent ? (
        <p className="text-slate-300">
          Mandamos um link para <strong>{email}</strong>. Abra o e-mail{' '}
          <em>neste mesmo aparelho</em> e você entra direto.
        </p>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-3">
          <input
            className="input"
            type="email"
            required
            autoComplete="email"
            placeholder="seu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button className="btn" disabled={busy}>
            {busy ? 'enviando…' : 'Receber link de acesso'}
          </button>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </form>
      )}
    </Centered>
  )
}

/** Logado mas sem casa: cria uma ou entra com o código de convite. */
export function Onboarding({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<'join' | 'create'>('join')
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [houseName, setHouseName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } =
      mode === 'join'
        ? await supabase.rpc('join_household', { code, display_name: name.trim() })
        : await supabase.rpc('create_household', {
            house_name: houseName.trim(),
            display_name: name.trim(),
          })
    setBusy(false)
    if (error) setError(error.message)
    else onDone()
  }

  return (
    <Centered title="Quase lá" subtitle="Como você aparece para o resto da casa?">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <input
          className="input"
          required
          placeholder="Seu nome"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <div className="flex gap-2 text-sm">
          <Toggle active={mode === 'join'} onClick={() => setMode('join')}>
            Entrar numa casa
          </Toggle>
          <Toggle active={mode === 'create'} onClick={() => setMode('create')}>
            Criar uma casa
          </Toggle>
        </div>

        {mode === 'join' ? (
          <input
            className="input font-mono tracking-widest"
            required
            placeholder="código de convite"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        ) : (
          <input
            className="input"
            required
            placeholder="Nome da casa"
            value={houseName}
            onChange={(e) => setHouseName(e.target.value)}
          />
        )}

        <button className="btn" disabled={busy}>
          {busy ? 'um instante…' : mode === 'join' ? 'Entrar' : 'Criar'}
        </button>
        {error && <p className="text-sm text-red-400">{error}</p>}
      </form>

      <button
        onClick={() => void supabase.auth.signOut()}
        className="mt-6 text-sm text-slate-500 underline"
      >
        sair desta conta
      </button>
    </Centered>
  )
}

function Toggle({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-xl border px-3 py-2 ${
        active
          ? 'border-emerald-600 bg-emerald-600/15 text-emerald-300'
          : 'border-slate-800 text-slate-400'
      }`}
    >
      {children}
    </button>
  )
}

function Centered({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: ReactNode
}) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 py-10">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mb-6 mt-1 text-slate-400">{subtitle}</p>
      {children}
    </div>
  )
}
