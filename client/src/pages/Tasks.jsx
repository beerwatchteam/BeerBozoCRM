import { useState, useEffect, useCallback } from 'react'
import {
  collection, query, orderBy, getDocs, addDoc, updateDoc, deleteDoc, doc,
} from 'firebase/firestore'
import { db } from '../firebase'
import { api } from '../utils/api'
import { PlusIcon, SparklesIcon, TrashIcon, CheckIcon } from '../components/Icons'

// ---------------------------------------------------------------------------
// Create Task modal
// ---------------------------------------------------------------------------

function CreateTaskModal({ onClose, onSave }) {
  const [title, setTitle]             = useState('')
  const [description, setDescription] = useState('')
  const [stages, setStages]           = useState([])
  const [stageInput, setStageInput]   = useState('')
  const [aiLoading, setAiLoading]     = useState(false)
  const [saving, setSaving]           = useState(false)

  async function handleAISuggest() {
    if (!title.trim()) return
    setAiLoading(true)
    try {
      const result = await api.post('/api/ai/suggest-task-stages', { taskName: title, description })
      setStages(result.stages || [])
    } catch (err) {
      console.error(err)
    } finally {
      setAiLoading(false)
    }
  }

  function addStage(e) {
    e?.preventDefault()
    const name = stageInput.trim()
    if (!name) return
    setStages(p => [...p, name])
    setStageInput('')
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    await onSave({
      title: title.trim(),
      description: description.trim(),
      stages: stages.map(name => ({ name, notes: '', completedAt: null })),
      activeStageIndex: 0,
      client_id: null,
    })
    setSaving(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-card-lg w-full max-w-lg mx-4 overflow-hidden">
        <div className="px-6 py-5 border-b border-bb-border">
          <h2 className="text-base font-semibold text-gray-900">New Task</h2>
        </div>
        <form onSubmit={handleSave} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Title *</label>
            <input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="What needs to be done?" className="input" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional details..." rows={2} className="input resize-none" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Stages</label>
              <button type="button" onClick={handleAISuggest} disabled={aiLoading || !title.trim()} className="flex items-center gap-1.5 text-xs font-medium text-bb-green hover:text-bb-green-dark transition-colors disabled:opacity-40">
                <SparklesIcon className="w-3.5 h-3.5" />
                {aiLoading ? 'Thinking...' : 'AI Suggest'}
              </button>
            </div>
            {stages.length > 0 && (
              <div className="space-y-1 mb-2">
                {stages.map((stage, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-2 bg-bb-light rounded-lg border border-bb-border">
                    <span className="w-5 h-5 rounded-full bg-white border border-bb-border flex items-center justify-center text-xs font-bold text-gray-500">{i + 1}</span>
                    <span className="flex-1 text-sm text-gray-800">{stage}</span>
                    <button type="button" onClick={() => setStages(p => p.filter((_, idx) => idx !== i))} className="text-gray-400 hover:text-red-500 transition-colors">
                      <TrashIcon />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input value={stageInput} onChange={e => setStageInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addStage(e)} placeholder="Stage name..." className="input flex-1" />
              <button type="button" onClick={addStage} disabled={!stageInput.trim()} className="btn-secondary px-3"><PlusIcon /></button>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving || !title.trim()} className="btn-primary">{saving ? 'Creating...' : 'Create Task'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Task Column (Trello-style)
// ---------------------------------------------------------------------------

function TaskColumn({ task, onUpdate, onDelete }) {
  const [collapsed, setCollapsed]   = useState(false)
  const [toggling, setToggling]     = useState(null)
  const [editing, setEditing]       = useState(false)
  const [editTitle, setEditTitle]   = useState(task.title)
  const [editDesc, setEditDesc]     = useState(task.description || '')
  const [editStages, setEditStages] = useState(task.stages || [])
  const [stageInput, setStageInput] = useState('')
  const [saving, setSaving]         = useState(false)

  function openEdit() {
    setEditTitle(task.title)
    setEditDesc(task.description || '')
    setEditStages(task.stages || [])
    setStageInput('')
    setEditing(true)
  }

  function addEditStage(e) {
    e?.preventDefault()
    const name = stageInput.trim()
    if (!name) return
    setEditStages(p => [...p, { name, notes: '', completedAt: null }])
    setStageInput('')
  }

  function removeEditStage(i) {
    setEditStages(p => p.filter((_, idx) => idx !== i))
  }

  function renameEditStage(i, val) {
    setEditStages(p => p.map((s, idx) => idx === i ? { ...s, name: val } : s))
  }

  async function saveEdit() {
    if (!editTitle.trim()) return
    setSaving(true)
    try {
      // Firestore doesn't allow undefined values — sanitise every field
      const newStages = editStages.map(s => ({
        name: s.name || '',
        notes: s.notes ?? '',
        completedAt: s.completedAt ?? null,
      }))
      const newCount = newStages.filter(s => s.completedAt).length
      const payload = {
        title: editTitle.trim(),
        description: editDesc.trim(),
        stages: newStages,
        activeStageIndex: newCount,
        updated_at: new Date().toISOString(),
      }
      await updateDoc(doc(db, 'tasks', task.id), payload)
      onUpdate({ ...task, ...payload })
      setEditing(false)
    } catch (err) {
      console.error('saveEdit failed:', err)
      alert('Save failed: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const stages         = task.stages || []
  const completedCount = stages.filter(s => s.completedAt).length
  const total          = stages.length
  const isComplete     = total > 0 && completedCount >= total
  const pct            = total ? Math.round((completedCount / total) * 100) : 0

  async function toggleStage(index) {
    if (toggling !== null) return
    setToggling(index)
    const stage = stages[index]
    const newCompletedAt = stage.completedAt ? null : new Date().toISOString()
    const newStages = stages.map((s, i) => i === index ? { ...s, completedAt: newCompletedAt } : s)
    const newCount = newStages.filter(s => s.completedAt).length
    const updated = { ...task, stages: newStages, activeStageIndex: newCount }
    await updateDoc(doc(db, 'tasks', task.id), {
      stages: newStages,
      activeStageIndex: newCount,
      updated_at: new Date().toISOString(),
    })
    onUpdate(updated)
    setToggling(null)
  }

  // Edit mode UI
  if (editing) {
    return (
      <div className="flex flex-col shrink-0 w-[260px] rounded-xl border border-bb-green/50 bg-[#1a1f2e]">
        <div className="px-3 pt-3 pb-2 border-b border-white/10">
          <p className="text-xs font-semibold text-bb-green uppercase tracking-wide mb-2">Edit Task</p>
          <input
            autoFocus
            value={editTitle}
            onChange={e => setEditTitle(e.target.value)}
            placeholder="Task title..."
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-bb-green mb-2"
          />
          <textarea
            value={editDesc}
            onChange={e => setEditDesc(e.target.value)}
            placeholder="Description (optional)..."
            rows={2}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-gray-300 placeholder-gray-600 focus:outline-none focus:border-bb-green resize-none"
          />
        </div>

        {/* Stage editing */}
        <div className="px-3 py-2 flex flex-col gap-1.5 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 340px)' }}>
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-0.5">Stages</p>
          {editStages.map((stage, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <input
                value={stage.name}
                onChange={e => renameEditStage(i, e.target.value)}
                className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-bb-green"
              />
              <button onClick={() => removeEditStage(i)} className="shrink-0 text-gray-600 hover:text-red-400 transition-colors p-1">
                <TrashIcon className="w-3 h-3" />
              </button>
            </div>
          ))}
          <div className="flex gap-1.5 mt-1">
            <input
              value={stageInput}
              onChange={e => setStageInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addEditStage(e)}
              placeholder="Add stage..."
              className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-bb-green"
            />
            <button onClick={addEditStage} disabled={!stageInput.trim()} className="shrink-0 px-2 py-1.5 rounded bg-white/5 border border-white/10 text-gray-400 hover:text-white disabled:opacity-30 transition-colors">
              <PlusIcon className="w-3 h-3" />
            </button>
          </div>
        </div>

        <div className="px-3 pb-3 pt-2 flex gap-2 border-t border-white/10">
          <button onClick={saveEdit} disabled={saving || !editTitle.trim()} className="flex-1 btn-primary text-xs py-1.5">
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button onClick={() => setEditing(false)} className="flex-1 text-xs py-1.5 rounded-lg border border-white/10 text-gray-400 hover:text-white hover:border-white/20 transition-colors">
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={`flex flex-col shrink-0 w-[260px] rounded-xl border bg-[#1a1f2e] transition-all ${
      isComplete ? 'border-emerald-600/40' : 'border-white/10'
    }`}>
      {/* Column header */}
      <div className="px-3 py-3 flex items-center gap-2">
        <button
          onClick={() => setCollapsed(p => !p)}
          className="flex-1 flex items-center gap-2 text-left min-w-0"
        >
          <span className={`text-gray-400 transition-transform duration-200 shrink-0 ${collapsed ? '-rotate-90' : ''}`}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 6l4 4 4-4"/>
            </svg>
          </span>
          <span className={`text-sm font-semibold break-words leading-snug ${isComplete ? 'text-emerald-400' : 'text-white'}`}>
            {task.title}
          </span>
        </button>

        {/* Stage count badge */}
        <span className={`shrink-0 text-xs font-bold px-2 py-0.5 rounded-full ${
          isComplete ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/10 text-gray-300'
        }`}>
          {completedCount}/{total}
        </span>

        {/* Edit */}
        <button
          onClick={openEdit}
          className="shrink-0 p-1 text-gray-600 hover:text-bb-green transition-colors rounded"
          title="Edit task"
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 2l3 3-9 9H2v-3l9-9z"/>
          </svg>
        </button>

        {/* Delete */}
        <button
          onClick={() => onDelete(task.id)}
          className="shrink-0 p-1 text-gray-600 hover:text-red-400 transition-colors rounded"
        >
          <TrashIcon className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Progress bar */}
      {total > 0 && (
        <div className="px-3 pb-2">
          <div className="h-1 bg-white/10 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${isComplete ? 'bg-emerald-500' : 'bg-bb-green'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {/* Description */}
      {!collapsed && task.description && (
        <p className="px-3 pb-2 text-xs text-gray-500">{task.description}</p>
      )}

      {/* Stage cards */}
      {!collapsed && (
        <div className="flex flex-col gap-1.5 px-2 pb-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 220px)' }}>
          {stages.length === 0 ? (
            <button onClick={openEdit} className="text-xs text-gray-600 hover:text-gray-400 px-2 py-3 text-center transition-colors">
              + Add stages
            </button>
          ) : (
            stages.map((stage, i) => {
              const done = !!stage.completedAt
              return (
                <button
                  key={i}
                  onClick={() => toggleStage(i)}
                  disabled={toggling !== null}
                  className={`w-full flex items-start gap-2.5 px-3 py-2.5 rounded-lg border text-left transition-all ${
                    done
                      ? 'bg-emerald-500/10 border-emerald-500/20'
                      : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'
                  } ${toggling === i ? 'opacity-50' : ''}`}
                >
                  <span className={`shrink-0 mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${
                    done ? 'bg-emerald-500 border-emerald-500' : 'border-gray-500 bg-transparent'
                  }`}>
                    {done && <CheckIcon className="w-2.5 h-2.5 text-white" />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className={`text-xs font-medium leading-snug block ${
                      done ? 'text-emerald-400 line-through decoration-emerald-600' : 'text-gray-200'
                    }`}>
                      {stage.name}
                    </span>
                    {done && stage.completedAt && (
                      <span className="text-[10px] text-emerald-600 mt-0.5 block">
                        {new Date(stage.completedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                      </span>
                    )}
                  </div>
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Tasks page
// ---------------------------------------------------------------------------

export default function Tasks() {
  const [tasks, setTasks]           = useState([])
  const [loading, setLoading]       = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [filterComplete, setFilterComplete] = useState(false)

  const loadTasks = useCallback(async () => {
    const snap = await getDocs(query(collection(db, 'tasks'), orderBy('created_at', 'desc')))
    setTasks(snap.docs.map(d => ({ ...d.data(), id: d.id })))
  }, [])

  useEffect(() => {
    loadTasks().finally(() => setLoading(false))
  }, [])

  async function handleCreate(data) {
    await addDoc(collection(db, 'tasks'), {
      ...data,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    await loadTasks()
  }

  function handleUpdate(updated) {
    setTasks(prev => prev.map(t => t.id === updated.id ? updated : t))
  }

  async function handleDelete(id) {
    await deleteDoc(doc(db, 'tasks', id))
    setTasks(prev => prev.filter(t => t.id !== id))
  }

  const isTaskComplete = t => {
    const s = t.stages || []
    return s.length > 0 && s.filter(x => x.completedAt).length >= s.length
  }

  const displayed     = tasks.filter(t => filterComplete ? true : !isTaskComplete(t))
  const completeCount = tasks.filter(isTaskComplete).length

  return (
    <div className="h-full flex flex-col bg-[#111827] overflow-hidden">
      {/* Top bar */}
      <div className="shrink-0 flex items-center justify-between px-5 py-3 border-b border-white/10">
        <div className="flex items-center gap-4">
          <span className="text-sm font-semibold text-white">
            {displayed.length} task{displayed.length !== 1 ? 's' : ''}
          </span>
          {completeCount > 0 && (
            <button
              onClick={() => setFilterComplete(p => !p)}
              className={`text-xs transition-colors ${filterComplete ? 'text-bb-green' : 'text-gray-500 hover:text-gray-300'}`}
            >
              {filterComplete ? 'Hide' : 'Show'} {completeCount} complete
            </button>
          )}
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="btn-primary flex items-center gap-1.5 text-sm px-4 py-2"
        >
          <PlusIcon /> New Task
        </button>
      </div>

      {/* Board — horizontal scroll */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-5 h-5 border-2 border-bb-green border-t-transparent rounded-full animate-spin" />
          </div>
        ) : displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-3">
            <div className="text-4xl">📋</div>
            <p className="text-sm">{tasks.length === 0 ? 'No tasks yet' : 'All done!'}</p>
            {tasks.length === 0 && (
              <button onClick={() => setShowCreate(true)} className="btn-primary text-sm flex items-center gap-2 mt-2">
                <PlusIcon /> Create your first task
              </button>
            )}
          </div>
        ) : (
          <div className="flex gap-3 px-5 py-4 h-full items-start">
            {displayed.map(task => (
              <TaskColumn
                key={task.id}
                task={task}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
              />
            ))}

            {/* Add column button */}
            <button
              onClick={() => setShowCreate(true)}
              className="shrink-0 w-[260px] flex items-center gap-2 px-4 py-3 rounded-xl border border-dashed border-white/20 text-gray-500 hover:text-gray-300 hover:border-white/30 transition-colors text-sm"
            >
              <PlusIcon /> Add task
            </button>
          </div>
        )}
      </div>

      {showCreate && (
        <CreateTaskModal onClose={() => setShowCreate(false)} onSave={handleCreate} />
      )}
    </div>
  )
}
