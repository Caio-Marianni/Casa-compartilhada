import { useState, type FormEvent } from 'react'
import { run, supabase, type Item } from './supabase'
import { useLive } from './useLive'

const DIAS_VISIVEIS = 2 // comprados mais velhos que isso saem da tela (e da query)
const MS_DESFAZER = 6000

export function Shopping({
  houseId,
  me,
  nameOf,
  onErro,
}: {
  houseId: string
  me: string
  nameOf: (id: string | null) => string
  onErro: (msg: string) => void
}) {
  const { rows, ready, setRows, refresh } = useLive<Item>('shopping_items', houseId, () => {
    const desde = new Date(Date.now() - DIAS_VISIVEIS * 864e5).toISOString()
    return supabase
      .from('shopping_items')
      .select('*')
      .eq('household_id', houseId)
      .or(`bought_at.is.null,bought_at.gt.${desde}`)
      .order('created_at')
  })

  const [name, setName] = useState('')
  // Aberto por padrão: no mercado você quer conferir o que já pegou.
  const [verComprados, setVerComprados] = useState(true)
  const [apagado, setApagado] = useState<Item | null>(null)

  const pendentes = rows.filter((i) => !i.bought_at)
  const comprados = rows.filter((i) => i.bought_at)

  async function add(e: FormEvent) {
    e.preventDefault()
    const nome = name.trim()
    if (!nome) return
    setName('')
    // sem otimismo aqui: o campo esvaziar já é o retorno visual, e inventar um id
    // temporário para reconciliar depois custa mais do que os ~200 ms que economiza
    await run(
      supabase.from('shopping_items').insert({ household_id: houseId, name: nome }),
      onErro,
    )
  }

  // Otimista: a tela muda no toque e o servidor confirma depois. Se falhar,
  // `refresh()` traz a verdade de volta — o realtime não avisa sobre o que não mudou.
  async function toggle(i: Item) {
    const novo = i.bought_at
      ? { bought_at: null, bought_by: null }
      : { bought_at: new Date().toISOString(), bought_by: me }
    setRows((rs) => rs.map((r) => (r.id === i.id ? { ...r, ...novo } : r)))
    const ok = await run(supabase.from('shopping_items').update(novo).eq('id', i.id), onErro)
    if (!ok) void refresh()
  }

  // Apagar é a única ação irreversível da tela, e o × fica a um deslize do dedo
  // da área de "comprei". Guardamos a linha inteira para poder reinserir com o
  // mesmo id — sem confirmação no caminho de quem acertou o alvo.
  async function remove(i: Item) {
    setRows((rs) => rs.filter((r) => r.id !== i.id))
    setApagado(i)
    setTimeout(() => setApagado((a) => (a?.id === i.id ? null : a)), MS_DESFAZER)
    const ok = await run(supabase.from('shopping_items').delete().eq('id', i.id), onErro)
    if (!ok) void refresh()
  }

  async function restaurar(i: Item) {
    setApagado(null)
    setRows((rs) => [...rs, i])
    const ok = await run(supabase.from('shopping_items').insert(i), onErro)
    if (!ok) void refresh()
  }

  return (
    <div className="flex flex-1 flex-col">
      <ul className="flex-1 space-y-2 px-4 pb-44">
        {!ready && <p className="label py-8 text-center">carregando…</p>}
        {ready && pendentes.length === 0 && (
          <p className="py-8 text-center text-sm text-mut">
            Lista vazia. Escreva abaixo o que está faltando.
          </p>
        )}

        {pendentes.length > 0 && (
          <li className="label pb-2">
            {pendentes.length} {pendentes.length === 1 ? 'item para comprar' : 'itens para comprar'}
          </li>
        )}

        {pendentes.map((i) => (
          <li key={i.id} className="flex items-center gap-3 border-b border-rule py-3">
            <button
              onClick={() => void toggle(i)}
              aria-label={`marcar ${i.name} como comprado`}
              className="size-6 shrink-0 rounded-full border-2 border-mut active:bg-ok"
            />
            <button onClick={() => void toggle(i)} className="flex-1 text-left">
              <span className="text-base">{i.name}</span>
              <span className="label mt-0.5 block">{nameOf(i.added_by)} pediu</span>
            </button>
            <button
              onClick={() => void remove(i)}
              aria-label={`apagar ${i.name}`}
              className="-mr-2 px-3 py-2 text-xl text-mut opacity-60"
            >
              ×
            </button>
          </li>
        ))}

        {comprados.length > 0 && (
          <li className="pt-6 pb-1">
            <button
              onClick={() => setVerComprados(!verComprados)}
              className="label"
            >
              {verComprados ? '▾' : '▸'} {comprados.length} comprado
              {comprados.length > 1 ? 's' : ''}
            </button>
          </li>
        )}
        {verComprados &&
          comprados.map((i) => (
            <li key={i.id} className="flex items-center gap-3 px-4 py-2 opacity-50">
              <button
                onClick={() => void toggle(i)}
                aria-label={`desmarcar ${i.name}`}
                className="size-6 shrink-0 rounded-full bg-ok text-center text-sm leading-6 text-on-ok"
              >
                ✓
              </button>
              <span className="flex-1 line-through">{i.name}</span>
              <span className="label">{nameOf(i.bought_by)}</span>
            </li>
          ))}
      </ul>

      {/* Fixo embaixo: é onde o dedo já está. */}
      <div className="fixed inset-x-0 bottom-0 mx-auto max-w-md border-t-2 border-rule bg-surf/95 backdrop-blur">
        {apagado && (
          <button
            onClick={() => void restaurar(apagado)}
            className="flex w-full items-center justify-between border-b border-rule px-4 py-2 text-sm"
          >
            <span className="truncate text-mut">“{apagado.name}” apagado</span>
            <span className="ml-3 shrink-0 font-medium text-acc">desfazer</span>
          </button>
        )}
        <form
          onSubmit={add}
          className="flex gap-2 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
        >
          <input
            className="input flex-1"
            placeholder="O que está faltando?"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button className="btn px-5" aria-label="adicionar">
            +
          </button>
        </form>
      </div>
    </div>
  )
}
