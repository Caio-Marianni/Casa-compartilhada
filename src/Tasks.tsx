import { useState, type FormEvent } from 'react'
import { supabase, type Recurrence, type Task } from './supabase'
import type { Member } from './useHousehold'
import { useLive } from './useLive'

const DIAS_VISIVEIS = 7

const RECORRENCIA: Record<Recurrence, string> = {
  daily: 'todo dia',
  weekly: 'toda semana',
  monthly: 'todo mês',
}

const hoje = () => new Date().toISOString().slice(0, 10)
const ddmm = (iso: string) => iso.slice(8, 10) + '/' + iso.slice(5, 7)

export function Tasks({
  houseId,
  me,
  members,
  nameOf,
}: {
  houseId: string
  me: string
  members: Member[]
  nameOf: (id: string | null) => string
}) {
  const { rows, ready } = useLive<Task>('tasks', houseId, () => {
    const desde = new Date(Date.now() - DIAS_VISIVEIS * 864e5).toISOString()
    return supabase
      .from('tasks')
      .select('*')
      .eq('household_id', houseId)
      .or(`done_at.is.null,done_at.gt.${desde}`)
  })

  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('')
  const [recurrence, setRecurrence] = useState('')
  const [assignee, setAssignee] = useState('')

  // sem data vai para o fim da lista
  const pendentes = rows
    .filter((t) => !t.done_at)
    .sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'))
  const feitas = rows
    .filter((t) => t.done_at)
    .sort((a, b) => b.done_at!.localeCompare(a.done_at!))

  async function add(e: FormEvent) {
    e.preventDefault()
    const t = title.trim()
    if (!t) return
    setTitle('')
    const { error } = await supabase.from('tasks').insert({
      household_id: houseId,
      title: t,
      due_date: due || null,
      recurrence: recurrence || null,
      assignee: assignee || null,
    })
    if (error) alert(error.message)
  }

  // Concluir dispara o trigger no banco: se for recorrente, a próxima ocorrência
  // aparece sozinha pelo realtime. Nenhum código de recorrência aqui.
  const concluir = (t: Task) =>
    supabase
      .from('tasks')
      .update({ done_at: new Date().toISOString(), done_by: me })
      .eq('id', t.id)

  // ponytail: desfazer não apaga a próxima ocorrência que o trigger já criou.
  // Se incomodar, apague a duplicata na mão — ou mova o trigger para AFTER com
  // uma checagem de "já existe pendente igual".
  const desfazer = (t: Task) =>
    supabase.from('tasks').update({ done_at: null, done_by: null }).eq('id', t.id)

  const remove = (t: Task) => supabase.from('tasks').delete().eq('id', t.id)

  return (
    <div className="flex flex-1 flex-col">
      <ul className="flex-1 space-y-2 px-4 pb-44">
        {!ready && <p className="py-8 text-center text-slate-500">carregando…</p>}
        {ready && pendentes.length === 0 && (
          <p className="py-8 text-center text-slate-500">Nenhuma tarefa pendente. Raro.</p>
        )}

        {pendentes.map((t) => {
          const atrasada = t.due_date != null && t.due_date < hoje()
          return (
            <li key={t.id} className="card flex items-center gap-3 px-4 py-3">
              <button
                onClick={() => void concluir(t)}
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
                onClick={() => void remove(t)}
                aria-label={`apagar ${t.title}`}
                className="px-2 text-xl text-slate-600"
              >
                ×
              </button>
            </li>
          )
        })}

        {feitas.length > 0 && (
          <li className="pt-6 pb-1 text-xs uppercase tracking-wide text-slate-500">
            últimos {DIAS_VISIVEIS} dias
          </li>
        )}
        {feitas.map((t) => (
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
