import { useState, type FormEvent, type ReactNode } from 'react'
import { supabase } from './supabase'

type Modo = 'entrar' | 'criar' | 'esqueci'

const TEXTOS: Record<Modo, { titulo: string; sub: string; acao: string }> = {
  entrar: {
    titulo: 'Casa Compartilhada',
    sub: 'Compras e tarefas de quem mora junto.',
    acao: 'Entrar',
  },
  criar: {
    titulo: 'Criar conta',
    sub: 'Depois você cria uma casa ou entra com o código de quem já mora lá.',
    acao: 'Criar conta',
  },
  esqueci: {
    titulo: 'Esqueci minha senha',
    sub: 'Mandamos um link para você escolher outra.',
    acao: 'Enviar link',
  },
}

/**
 * Login por e-mail e senha.
 *
 * Era magic link. Trocou porque o Supabase segura o envio de e-mail e um app de
 * casa não pode depender disso para abrir: com senha, entrar não manda e-mail
 * nenhum. Sobrou e-mail em dois lugares raros — confirmar conta nova e recuperar
 * senha.
 */
export function Login() {
  const [modo, setModo] = useState<Modo>('entrar')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  // Sucesso que NÃO loga ninguém: conta criada esperando confirmação, ou link de
  // recuperação enviado. Quem entra de verdade nem chega a ver isto — o
  // onAuthStateChange troca a tela embaixo do usuário.
  const [aviso, setAviso] = useState<string | null>(null)

  function troca(m: Modo) {
    setModo(m)
    setErro(null)
    setAviso(null)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErro(null)
    const mail = email.trim()

    if (modo === 'entrar') {
      const { error } = await supabase.auth.signInWithPassword({ email: mail, password: senha })
      if (error) setErro(traduz(error.message))
    } else if (modo === 'criar') {
      const { data, error } = await supabase.auth.signUp({
        email: mail,
        password: senha,
        options: { emailRedirectTo: location.origin },
      })
      if (error) setErro(traduz(error.message))
      // Veio sessão = "Confirm email" está desligado no painel, a pessoa já entrou.
      // Veio null = precisa confirmar antes, e aí o e-mail é obrigatório.
      else if (!data.session)
        setAviso(`Conta criada. Abra o link que mandamos para ${mail} para confirmar.`)
    } else {
      const { error } = await supabase.auth.resetPasswordForEmail(mail, {
        redirectTo: location.origin,
      })
      if (error) setErro(traduz(error.message))
      // De propósito não diz se a conta existe: isso vira uma forma de descobrir
      // quem tem cadastro aqui.
      else setAviso(`Se existe conta para ${mail}, o link de nova senha está a caminho.`)
    }
    setBusy(false)
  }

  const t = TEXTOS[modo]

  if (aviso)
    return (
      <Centered title="Confira seu e-mail" subtitle={aviso}>
        <p className="text-sm text-mut">
          Abra o link <em>neste mesmo aparelho</em>. Se não chegar em alguns minutos, veja o spam.
        </p>
        <Link onClick={() => troca('entrar')}>voltar para o login</Link>
      </Centered>
    )

  return (
    <Centered title={t.titulo} subtitle={t.sub}>
      {modo !== 'esqueci' && (
        <div className="mb-4 flex gap-2 text-sm">
          <Toggle active={modo === 'entrar'} onClick={() => troca('entrar')}>
            Entrar
          </Toggle>
          <Toggle active={modo === 'criar'} onClick={() => troca('criar')}>
            Criar conta
          </Toggle>
        </div>
      )}

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

        {modo !== 'esqueci' && (
          <CampoSenha
            value={senha}
            onChange={setSenha}
            novo={modo === 'criar'}
            placeholder={modo === 'criar' ? 'crie uma senha' : 'sua senha'}
          />
        )}

        <button className="btn" disabled={busy}>
          {busy ? 'um instante…' : t.acao}
        </button>
        {erro && <p className="text-sm text-danger">{erro}</p>}
      </form>

      <Link onClick={() => troca(modo === 'esqueci' ? 'entrar' : 'esqueci')}>
        {modo === 'esqueci' ? 'voltar para o login' : 'esqueci minha senha'}
      </Link>
    </Centered>
  )
}

/**
 * Tela do link de recuperação: a pessoa chega aqui já autenticada numa sessão de
 * recuperação. Sem esta tela ela cairia direto no app e nunca trocaria a senha —
 * o link tem prazo, e no próximo login estaria trancada de novo.
 */
export function NovaSenha({ onDone }: { onDone: () => void }) {
  const [senha, setSenha] = useState('')
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErro(null)
    const { error } = await supabase.auth.updateUser({ password: senha })
    setBusy(false)
    if (error) setErro(traduz(error.message))
    else onDone()
  }

  return (
    <Centered title="Nova senha" subtitle="Escolha a senha que você vai usar daqui em diante.">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <CampoSenha value={senha} onChange={setSenha} novo placeholder="nova senha" />
        <button className="btn" disabled={busy}>
          {busy ? 'salvando…' : 'Salvar senha'}
        </button>
        {erro && <p className="text-sm text-danger">{erro}</p>}
      </form>

      <Link onClick={() => void supabase.auth.signOut()}>cancelar e sair</Link>
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
        {error && <p className="text-sm text-danger">{error}</p>}
      </form>

      <Link onClick={() => void supabase.auth.signOut()}>sair desta conta</Link>
    </Centered>
  )
}

/**
 * O Supabase responde em inglês. Sem isto a pessoa lê "Invalid login credentials"
 * e não descobre que a saída dela é o "esqueci minha senha" logo abaixo.
 *
 * O fallback devolve o texto original: mensagem nova do Supabase aparece crua em
 * inglês, que é feio mas nunca engana.
 */
const MENSAGENS: [RegExp, string][] = [
  [
    /rate limit|only request this after/i,
    'Muitos e-mails em pouco tempo. O envio trava por cerca de uma hora — espere e tente de novo.',
  ],
  [
    /invalid login credentials/i,
    'E-mail ou senha não conferem. Se você entrava pelo link de e-mail, use "esqueci minha senha" para criar uma.',
  ],
  [
    /user already registered|already been registered/i,
    'Já existe conta com esse e-mail. Entre normalmente, ou use "esqueci minha senha".',
  ],
  [/password should be at least|password is too short/i, 'Senha curta demais — use 8 ou mais.'],
  [/email not confirmed/i, 'Confirme o e-mail pelo link que mandamos antes de entrar.'],
  [
    /different from the old|same.*old password/i,
    'A senha nova precisa ser diferente da que você já usava.',
  ],
  [/expired|invalid.*token/i, 'Este link já expirou. Peça outro em "esqueci minha senha".'],
]

function traduz(msg: string) {
  return MENSAGENS.find(([re]) => re.test(msg))?.[1] ?? msg
}

/** Campo de senha com "mostrar": mais barato que um segundo campo de confirmação. */
function CampoSenha({
  value,
  onChange,
  novo,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  novo?: boolean
  placeholder: string
}) {
  const [visivel, setVisivel] = useState(false)
  return (
    <div className="relative">
      <input
        className="input pr-20"
        type={visivel ? 'text' : 'password'}
        required
        minLength={novo ? 8 : undefined}
        autoComplete={novo ? 'new-password' : 'current-password'}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        onClick={() => setVisivel((v) => !v)}
        className="absolute inset-y-0 right-0 px-4 text-sm text-mut"
      >
        {visivel ? 'ocultar' : 'mostrar'}
      </button>
    </div>
  )
}

function Link({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} className="mt-6 self-start text-sm text-mut underline">
      {children}
    </button>
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
      className={`flex-1 rounded-xl border-2 px-3 py-2 ${
        active ? 'border-acc bg-acc/15 text-acc' : 'border-rule text-mut'
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
      <h1 className="display text-[28px]">{title}</h1>
      <p className="mb-6 mt-2 text-mut">{subtitle}</p>
      {children}
    </div>
  )
}
