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
  const [title, setTitle]           = useState('')
  const [description, setDescription] = useState('')
  const [stages, setStages]         = useState([])
  const [stageInput, setStageInput] = useState('')
  const [aiLoading, setAiLoading]   = useState(false)
  const [saving, setSaving]         = useState(false)

  async function handleAISuggest() {
    if (!title.trim()) return
    setAiLoading(true)
    try {
      const result = await api.post('/api/ai/suggest-task-stages', {
        taskName: title,
        description,
      })
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

  function removeStage(i) {
    setStages(p => p.filter((_, idx) => idx !== i))
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
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Title *
            </label>
            <input
              autoFocus
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="What needs to be done?"
              className="input"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Description
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Optional details..."
              rows={2}
              className="input resize-none"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Stages
              </label>
              <button
                type="button"
                onClick={handleAISuggest}
                disabled={aiLoading || !title.trim()}
                className="flex items-center gap-1.5 text-xs font-medium text-bb-green hover:text-bb-green-dark transition-colors disabled:opacity-40"
              >
                <SparklesIcon className="w-3.5 h-3.5" />
                {aiLoading ? 'Thinking...' : 'AI Suggest'}
              </button>
            </div>

            {stages.length > 0 && (
              <div className="space-y-1 mb-2">
                {stages.map((stage, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-2 bg-bb-light rounded-lg border border-bb-border">
                    <span className="w-5 h-5 rounded-full bg-white border border-bb-border flex items-center justify-center text-xs font-bold text-gray-500">
                      {i + 1}
                    </span>
                    <span className="flex-1 text-sm text-gray-800">{stage}</span>
                    <button
                      type="button"
                      onClick={() => removeStage(i)}
                      className="text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <TrashIcon />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <input
                value={stageInput}
                onChange={e => setStageInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addStage(e)}
                placeholder="Stage name..."
                className="input flex-1"
              />
              <button
                type="button"
                onClick={addStage}
                disabled={!stageInput.trim()}
                className="btn-secondary px-3"
              >
                <PlusIcon />
              </button>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving || !title.trim()} className="btn-primary">
              {saving ? 'Creating...' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Accordion Task Card
// ---------------------------------------------------------------------------

function TaskAccordion({ task, onUpdate, onDelete }) {
  const [expanded, setExpanded] = useState(false)
  const [toggling, setToggling] = useState(null)

  const stages = task.stages || []
  const completedCount = stages.filter(s => s.completedAt).length
  const total = stages.length
  const isComplete = total > 0 && completedCount >= total
  const pct = total ? Math.round((completedCount / total) * 100) : 0

  async function toggleStage(index) {
    if (toggling !== null) return
    setToggling(index)
    const stage = stages[index]
    const newCompletedAt = stage.completedAt ? null : new Date().toISOString()
    const newStages = stages.map((s, i) =>
      i === index ? { ...s, completedAt: newCompletedAt } : s
    )
    const newCompleteCount = newStages.filter(s => s.completedAt).length
    const updated = { ...task, stages: newStages, activeStageIndex: newCompleteCount }
    await updateDoc(doc(db, 'tasks', task.id), {
      stages: newStages,
      activeStageIndex: newCompleteCount,
      updated_at: new Date().toISOString(),
    })
    onUpdate(updated)
    setToggling(null)
  }

  return (
    <div className={`bg-white rounded-xl border transition-all ${
      isComplete ? 'border-emerald-200' : 'border-bb-border'
    } shadow-sm`}>
      {/* Header row — always visible */}
      <button
        onClick={() => setExpanded(p => !p)}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
      >
        {/* Expand chevron */}
        <span className={`text-gray-400 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </span>

        {/* Title */}
        <span className={`flex-1 text-sm font-semibold truncate ${isComplete ? 'text-emerald-700 line-through decoration-emerald-400' : 'text-gray-900'}`}>
          {task.title}
        </span>

        {/* Progress badge */}
        {total > 0 && (
          <span className={`shrink-0 text-xs font-medium px-2.5 py-0.5 rounded-full ${
            isComplete
              ? 'bg-emerald-100 text-emerald-700'
              : 'bg-bb-green-light text-bb-green'
          }`}>
            {isComplete ? 'Done' : `${completedCount}/${total}`}
          </span>
        )}

        {/* Delete */}
        <span
          role="button"
          onClick={e => { e.stopPropagation(); onDelete(task.id) }}
          className="shrink-0 p-1 text-gray-300 hover:text-red-500 transition-colors rounded"
        >
          <TrashIcon className="w-3.5 h-3.5" />
        </span>
      </button>

      {/* Progress bar */}
      {total > 0 && (
        <div className="px-4 pb-0">
          <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${isComplete ? 'bg-emerald-400' : 'bg-bb-green'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 pb-4 pt-3">
          {task.description && (
            <p className="text-xs text-gray-500 mb-4 pl-5">{task.description}</p>
          )}

          {stages.length === 0 ? (
            <p className="text-xs text-gray-400 pl-5 py-2">No stages added.</p>
          ) : (
            <div className="space-y-1 pl-2">
              {stages.map((stage, i) => {
                const done = !!stage.completedAt
                return (
                  <button
                    key={i}
                    onClick={() => toggleStage(i)}
                    disabled={toggling !== null}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all ${
                      done
                        ? 'bg-emerald-50 border-emerald-200 opacity-75'
                        : 'bg-bb-light border-bb-border hover:border-bb-green hover:bg-bb-green-light'
                    } ${toggling === i ? 'opacity-50' : ''}`}
                  >
                    {/* Checkbox */}
                    <span className={`shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                      done
                        ? 'bg-emerald-500 border-emerald-500'
                        : 'border-gray-300 bg-white'
                    }`}>
                      {done && <CheckIcon className="w-3 h-3 text-white" />}
                    </span>

                    {/* Stage name */}
                    <span className={`flex-1 text-sm ${done ? 'text-emerald-700 line-through decoration-emerald-400' : 'text-gray-800 font-medium'}`}>
                      {stage.name}
                    </span>

                    {/* Completed date */}
                    {done && stage.completedAt && (
                      <span className="text-xs text-emerald-600 shrink-0">
                        {new Date(stage.completedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
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
    const stages = t.stages || []
    return stages.length > 0 && stages.filter(s => s.completedAt).length >= stages.length
  }

  const displayed = tasks.filter(t => filterComplete ? true : !isTaskComplete(t))
  const completeCount = tasks.filter(isTaskComplete).length

  return (
    <div className="h-full overflow-y-auto bg-bb-light">
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Page header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Tasks</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              {displayed.length} task{displayed.length !== 1 ? 's' : ''}
              {completeCount > 0 && (
                <button
                  onClick={() => setFilterComplete(p => !p)}
                  className={`ml-2 underline transition-colors ${filterComplete ? 'text-bb-green' : 'text-gray-400 hover:text-gray-600'}`}
                >
                  {filterComplete ? 'hide' : 'show'} {completeCount} complete
                </button>
              )}
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="btn-primary flex items-center gap-1.5 text-sm px-4 py-2"
          >
            <PlusIcon /> New Task
          </button>
        </div>

        {/* Task list */}
        {loading ? (
          <div className="flex justify-center pt-16">
            <div className="w-5 h-5 border-2 border-bb-green border-t-transparent rounded-full animate-spin" />
          </div>
        ) : displayed.length === 0 ? (
          <div className="text-center pt-20 text-gray-400">
            <div className="text-4xl mb-3">📋</div>
            <p className="text-sm font-medium text-gray-500">
              {tasks.length === 0 ? 'No tasks yet' : 'All done!'}
            </p>
            {tasks.length === 0 && (
              <button onClick={() => setShowCreate(true)} className="btn-primary text-sm flex items-center gap-2 mx-auto mt-4">
                <PlusIcon /> Create your first task
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {displayed.map(task => (
              <TaskAccordion
                key={task.id}
                task={task}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <CreateTaskModal onClose={() => setShowCreate(false)} onSave={handleCreate} />
      )}
    </div>
  )
}
