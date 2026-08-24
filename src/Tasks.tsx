import { useState, type FormEvent } from 'react'
import { run, supabase, type Recurrence, type Task } from './supabase'
import type { Member } from './useHousehold'
import { useLive } from './useLive'

const DIAS_VISIVEIS = 7

const RECORRENCIA: Record<Recurrence, string> = {
  daily: 'todo dia',
  weekly: 'toda semana',
  monthly: 'todo mês',
}

// Data local, não UTC: toISOString() vira o dia às 21h no Brasil e faria toda tarefa
// de hoje aparecer "atrasada" à noite. 'sv-SE' é o locale que formata como YYYY-MM-DD.
const hoje = () => new Date().toLocaleDateString('sv-SE')
const ddmm = (iso: string) => iso.slice(8, 10) + '/' + iso.slice(5, 7)

export function Tasks({
  houseId,
  me,
  members,
  nameOf,
  onErro,
}: {
  houseId: string
  me: string
  members: Member[]
  nameOf: (id: string | null) => string
  onErro: (msg: string) => void
}) {
  const { rows, ready, setRows, refresh } = useLive<Task>('tasks', houseId, () => {
    const desde = new Date(Date.now() - DIAS_VISIVEIS * 864e5).toISOString()
    return supabase
      .from('tasks')
      .select('*')
      .eq('household_id', houseId)
      .or(`done_at.is.null,done_at.gt.${desde}`)
  })

  const [open, setOpen] = useState(false)
  const [verFeitas, setVerFeitas] = useState(false)
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('')
  const [recurrence, setRecurrence] = useState('')
  const [assignee, setAssignee] = useState('')

  // Agenda separada do que dá para fazer agora. Sem isso, concluir uma tarefa
  // recorrente faz a próxima ocorrência reaparecer no topo da lista ativa, e ela
  // parece a mesma tarefa "voltando" — que foi como este split nasceu.
  const hj = hoje()
  const agora = rows
    .filter((t) => !t.done_at && (!t.due_date || t.due_date <= hj))
    .sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'))
  const proximas = rows
    .filter((t) => !t.done_at && t.due_date && t.due_date > hj)
    .sort((a, b) => a.due_date!.localeCompare(b.due_date!))
  const feitas = rows
    .filter((t) => t.done_at)
    .sort((a, b) => b.done_at!.localeCompare(a.done_at!))

  async function add(e: FormEvent) {
    e.preventDefault()
    const t = title.trim()
    if (!t) return
    setTitle('')
    await run(
      supabase.from('tasks').insert({
        household_id: houseId,
        title: t,
        due_date: due || null,
        recurrence: recurrence || null,
        assignee: assignee || null,
      }),
      onErro,
    )
  }

  // Concluir dispara o trigger no banco: se for recorrente, a próxima ocorrência
  // aparece sozinha pelo realtime, já em "próximas". Nenhum código de recorrência aqui.
  // A marcação é otimista; a ocorrência nova continua vindo pelo servidor.
  async function concluir(t: Task) {
    const novo = { done_at: new Date().toISOString(), done_by: me }
    setRows((rs) => rs.map((r) => (r.id === t.id ? { ...r, ...novo } : r)))
    const ok = await run(supabase.from('tasks').update(novo).eq('id', t.id), onErro)
    if (!ok) void refresh()
  }

  // Desmarcar leva junto a ocorrência que a conclusão gerou (trigger
  // `tasks_unrecurrence`), então a lista não acumula linhas idênticas.
  async function desfazer(t: Task) {
    const novo = { done_at: null, done_by: null }
    setRows((rs) => rs.map((r) => (r.id === t.id ? { ...r, ...novo } : r)))
    const ok = await run(supabase.from('tasks').update(novo).eq('id', t.id), onErro)
    if (!ok) void refresh()
  }

  async function remove(t: Task) {
    setRows((rs) => rs.filter((r) => r.id !== t.id))
    const ok = await run(supabase.from('tasks').delete().eq('id', t.id), onErro)
    if (!ok) void refresh()
  }

  return (
    <div className="flex flex-1 flex-col">
      <ul className="flex-1 space-y-2 px-4 pb-44">
        {!ready && <p className="py-8 text-center text-slate-500">carregando…</p>}
        {ready && agora.length === 0 && (
          <p className="py-8 text-center text-slate-500">Nada para hoje.</p>
        )}

        {agora.map((t) => (
          <Linha
            key={t.id}
            t={t}
            nameOf={nameOf}
            onConcluir={() => void concluir(t)}
            onRemover={() => void remove(t)}
          />
        ))}

        {proximas.length > 0 && (
          <li className="pt-6 pb-1 text-xs uppercase tracking-wide text-slate-500">
            próximas
          </li>
        )}
        {proximas.map((t) => (
          <Linha
            key={t.id}
            t={t}
            futura
            nameOf={nameOf}
            onConcluir={() => void concluir(t)}
            onRemover={() => void remove(t)}
          />
        ))}

        {feitas.length > 0 && (
          <li className="pt-6 pb-1">
            <button
              onClick={() => setVerFeitas(!verFeitas)}
              className="text-xs uppercase tracking-wide text-slate-500"
            >
              {verFeitas ? '▾' : '▸'} {feitas.length} concluída
              {feitas.length > 1 ? 's' : ''} · {DIAS_VISIVEIS} dias
            </button>
          </li>
        )}
        {verFeitas &&
          feitas.map((t) => (
            <li key={t.id} className="flex items-center gap-3 px-4 py-2 opacity-50">
              <button
                onClick={() => void desfazer(t)}
                aria-label={`desmarcar ${t.title}`}
                className="size-6 shrink-0 rounded-md bg-emerald-600 text-center text-sm leading-6"
              >
                ✓
              </button>
              <span className="flex-1 line-through">{t.title}</span>
              <span className="text-xs text-slate-500">{nameOf(t.done_by)}</span>
            </li>
          ))}
      </ul>

      <form
        onSubmit={add}
        className="fixed inset-x-0 bottom-0 mx-auto max-w-md space-y-2 border-t border-slate-800 bg-slate-950/95 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur"
      >
        {open && (
          <div className="flex gap-2 text-sm">
            {/* input date nativo: o celular já tem um seletor de data melhor que qualquer lib */}
            <input
              type="date"
              className="input flex-1 px-3 py-2"
              value={due}
              onChange={(e) => setDue(e.target.value)}
            />
            <select
              className="input flex-1 px-3 py-2"
              value={recurrence}
              onChange={(e) => setRecurrence(e.target.value)}
            >
              <option value="">uma vez</option>
              {Object.entries(RECORRENCIA).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
            <select
              className="input flex-1 px-3 py-2"
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
            >
              <option value="">qualquer um</option>
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.display_name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-label="mais opções"
            className="rounded-xl border border-slate-800 px-3 text-slate-400"
          >
            {open ? '▾' : '▸'}
          </button>
          <input
            className="input flex-1"
            placeholder="Nova tarefa"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <button className="btn px-5" aria-label="adicionar">
            +
          </button>
        </div>
      </form>
    </div>
  )
}

function Linha({
  t,
  futura,
  nameOf,
  onConcluir,
  onRemover,
}: {
  t: Task
  futura?: boolean
  nameOf: (id: string | null) => string
  onConcluir: () => void
  onRemover: () => void
}) {
  const atrasada = !futura && t.due_date != null && t.due_date < hoje()
  return (
    <li className={`card flex items-center gap-3 px-4 py-3 ${futura ? 'opacity-60' : ''}`}>
      <button
        onClick={onConcluir}
        aria-label={`concluir ${t.title}`}
        className="size-6 shrink-0 rounded-md border-2 border-slate-600 active:bg-emerald-600"
      />
      <div className="flex-1">
        <span className="text-base">{t.title}</span>
        <span className="block text-xs text-slate-500">
          {t.due_date && (
            <span className={atrasada ? 'font-medium text-red-400' : ''}>
              {ddmm(t.due_date)}
              {atrasada && ' · atrasada'}
            </span>
          )}
          {t.due_date && (t.recurrence || t.assignee) && ' · '}
          {t.recurrence && RECORRENCIA[t.recurrence]}
          {t.recurrence && t.assignee && ' · '}
          {t.assignee && nameOf(t.assignee)}
        </span>
      </div>
      <button
        onClick={onRemover}
        aria-label={`apagar ${t.title}`}
        className="px-2 text-xl text-slate-600"
      >
        ×
      </button>
    </li>
  )
}
