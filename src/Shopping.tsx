import { useState, type FormEvent } from 'react'
import { supabase, type Item } from './supabase'
import { useLive } from './useLive'

const DIAS_VISIVEIS = 2 // comprados mais velhos que isso saem da tela (e da query)

export function Shopping({
  houseId,
  me,
  nameOf,
}: {
  houseId: string
  me: string
  nameOf: (id: string | null) => string
}) {
  const { rows, ready } = useLive<Item>('shopping_items', houseId, () => {
    const desde = new Date(Date.now() - DIAS_VISIVEIS * 864e5).toISOString()
    return supabase
      .from('shopping_items')
      .select('*')
      .eq('household_id', houseId)
      .or(`bought_at.is.null,bought_at.gt.${desde}`)
      .order('created_at')
  })

  const [name, setName] = useState('')
  const [qty, setQty] = useState('')

  const pendentes = rows.filter((i) => !i.bought_at)
  const comprados = rows.filter((i) => i.bought_at)

  async function add(e: FormEvent) {
    e.preventDefault()
    const nome = name.trim()
    if (!nome) return
    setName('')
    setQty('')
    const { error } = await supabase
      .from('shopping_items')
      .insert({ household_id: houseId, name: nome, qty: qty.trim() || null })
    if (error) alert(error.message)
  }

  const toggle = (i: Item) =>
    supabase
      .from('shopping_items')
      .update(
        i.bought_at
          ? { bought_at: null, bought_by: null }
          : { bought_at: new Date().toISOString(), bought_by: me },
      )
      .eq('id', i.id)

  const remove = (i: Item) => supabase.from('shopping_items').delete().eq('id', i.id)

  return (
    <div className="flex flex-1 flex-col">
      <ul className="flex-1 space-y-2 px-4 pb-40">
        {!ready && <p className="py-8 text-center text-slate-500">carregando…</p>}
        {ready && pendentes.length === 0 && (
          <p className="py-8 text-center text-slate-500">Nada na lista. Casa abastecida.</p>
        )}

        {pendentes.map((i) => (
          <li key={i.id} className="card flex items-center gap-3 px-4 py-3">
            <button
              onClick={() => void toggle(i)}
              aria-label={`marcar ${i.name} como comprado`}
              className="size-6 shrink-0 rounded-full border-2 border-slate-600 active:bg-emerald-600"
            />
            <button onClick={() => void toggle(i)} className="flex-1 text-left">
              <span className="text-base">{i.name}</span>
              {i.qty && <span className="ml-2 text-sm text-slate-400">{i.qty}</span>}
              <span className="block text-xs text-slate-500">{nameOf(i.added_by)} pediu</span>
            </button>
            <button
              onClick={() => void remove(i)}
              aria-label={`apagar ${i.name}`}
              className="px-2 text-xl text-slate-600"
            >
              ×
            </button>
          </li>
        ))}

        {comprados.length > 0 && (
          <li className="pt-6 pb-1 text-xs uppercase tracking-wide text-slate-500">
            comprados
          </li>
        )}
        {comprados.map((i) => (
          <li key={i.id} className="flex items-center gap-3 px-4 py-2 opacity-50">
            <button
              onClick={() => void toggle(i)}
              aria-label={`desmarcar ${i.name}`}
              className="size-6 shrink-0 rounded-full bg-emerald-600 text-center text-sm leading-6"
            >
              ✓
            </button>
            <span className="flex-1 line-through">{i.name}</span>
            <span className="text-xs text-slate-500">{nameOf(i.bought_by)}</span>
          </li>
        ))}
      </ul>

      {/* Fixo embaixo: é onde o dedo já está. */}
      <form
        onSubmit={add}
        className="fixed inset-x-0 bottom-0 mx-auto flex max-w-md gap-2 border-t border-slate-800 bg-slate-950/95 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur"
      >
        <input
          className="input flex-1"
          placeholder="Adicionar item"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="input w-20 text-center"
          placeholder="qtd"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
        />
        <button className="btn px-5" aria-label="adicionar">
          +
        </button>
      </form>
    </div>
  )
}
