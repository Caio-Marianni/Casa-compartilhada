import { useEffect, useState } from 'react'
import { run, supabase, type House } from './supabase'
import type { Member } from './useHousehold'

/**
 * Quem mora na casa: convidar, renomear a si mesmo, tirar alguém.
 *
 * Sem papel de admin: qualquer morador remove qualquer morador. É a mesma decisão
 * que já vale para itens e tarefas — numa casa de 3 pessoas, quem abusa disso tem
 * um problema social, não um problema de permissão.
 */
export function Household({
  house,
  members,
  me,
  email,
  onErro,
  refresh,
}: {
  house: House
  members: Member[]
  me: string
  email?: string
  onErro: (msg: string) => void
  refresh: () => void
}) {
  const [copiado, setCopiado] = useState(false)

  // household_members ficou fora do realtime: ninguém entra na casa duas vezes por
  // dia. Recarrega ao abrir a aba, que é exatamente quando alguém quer ver quem entrou.
  useEffect(() => {
    void refresh()
  }, [refresh])

  const eu = members.find((m) => m.user_id === me)
  const outros = members
    .filter((m) => m.user_id !== me)
    .sort((a, b) => a.display_name.localeCompare(b.display_name))

  async function convidar() {
    const texto = `Entra na casa "${house.name}": código ${house.invite_code} — ${location.origin}`
    // Share nativo no celular (WhatsApp da casa em dois toques), clipboard no resto.
    if (navigator.share) {
      await navigator.share({ text: texto }).catch(() => {})
      return
    }
    await navigator.clipboard.writeText(texto)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 1500)
  }

  async function renomear(valor: string) {
    const nome = valor.trim()
    if (!nome || nome === eu?.display_name) return
    const ok = await run(
      supabase
        .from('household_members')
        .update({ display_name: nome })
        .eq('household_id', house.id)
        .eq('user_id', me),
      onErro,
    )
    if (ok) refresh()
  }

  async function remover(m: Member) {
    const sou_eu = m.user_id === me
    const pergunta = sou_eu
      ? `Sair da casa "${house.name}"? Para voltar você precisa do código de convite.`
      : `Tirar ${m.display_name} da casa? As tarefas e compras dele(a) continuam na lista.`
    if (!confirm(pergunta)) return

    const ok = await run(
      supabase
        .from('household_members')
        .delete()
        .eq('household_id', house.id)
        .eq('user_id', m.user_id),
      onErro,
    )
    // Sair de casa cai no onboarding sozinho: sem membro, useHousehold não acha casa.
    if (ok) refresh()
  }

  return (
    <div className="flex flex-1 flex-col gap-6 px-4 pb-10">
      <section className="card p-4">
        <h2 className="text-xs uppercase tracking-wide text-slate-500">convite</h2>
        <p className="mt-1 font-mono text-2xl tracking-widest">{house.invite_code}</p>
        <p className="mt-1 text-xs text-slate-500">
          Quem tiver este código entra na casa e vê tudo. Só passe para quem mora aqui.
        </p>
        <button onClick={() => void convidar()} className="btn mt-3 w-full">
          {copiado ? 'copiado!' : 'Convidar alguém'}
        </button>
      </section>

      <section>
        <h2 className="mb-2 text-xs uppercase tracking-wide text-slate-500">
          moradores · {members.length}
        </h2>
        <ul className="space-y-2">
          {eu && (
            <li className="card p-3">
              <label
                htmlFor="meu-nome"
                className="mb-1 block text-xs text-slate-500"
              >
                você{email && ` · ${email}`}
              </label>
              {/* Sem estado controlado: o defaultValue vem dos membros e a key o
                  recarrega se alguém mudar de outro aparelho. Salva ao sair do campo. */}
              <input
                id="meu-nome"
                key={eu.display_name}
                defaultValue={eu.display_name}
                className="input py-2"
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                onBlur={(e) => void renomear(e.target.value)}
              />
              <button
                onClick={() => void remover(eu)}
                className="mt-3 text-sm text-red-400"
              >
                sair da casa
              </button>
            </li>
          )}

          {outros.map((m) => (
            <li key={m.user_id} className="card flex items-center gap-3 px-4 py-3">
              <span className="flex-1">{m.display_name}</span>
              <button
                onClick={() => void remover(m)}
                aria-label={`tirar ${m.display_name} da casa`}
                className="px-2 text-xl text-slate-600"
              >
                ×
              </button>
            </li>
          ))}

          {outros.length === 0 && (
            <li className="py-6 text-center text-sm text-slate-500">
              Só você por aqui. Manda o código para o resto da casa.
            </li>
          )}
        </ul>
      </section>

      <button
        onClick={() => void supabase.auth.signOut()}
        className="self-start text-sm text-slate-500 underline"
      >
        sair desta conta neste aparelho
      </button>
    </div>
  )
}
