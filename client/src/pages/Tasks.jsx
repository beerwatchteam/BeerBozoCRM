import { useState, useEffect, useCallback } from 'react'
import {
  collection, query, orderBy, getDocs, addDoc, updateDoc, deleteDoc, doc,
} from 'firebase/firestore'
import { db } from '../firebase'
import { api } from '../utils/api'
import WorkflowTimeline from '../components/WorkflowTimeline'
import { PlusIcon, SparklesIcon, TrashIcon, CheckIcon } from '../components/Icons'

// ---------------------------------------------------------------------------
// Create Task modal
// ---------------------------------------------------------------------------

function CreateTaskModal({ onClose, onSave }) {
  const [title, setTitle]           = useState('')
  const [description, setDescription] = useState('')
  const [stages, setStages]         = useState([])
  const [stageInput, setStageInput] = useState('')
  const [aiContext, setAiContext]    = useState('')
  const [aiLoading, setAiLoading]   = useState(false)
  const [saving, setSaving]         = useState(false)

  async function handleAISuggest() {
    if (!title.trim() && !aiContext.trim()) return
    setAiLoading(true)
    try {
      const result = await api.post('/api/ai/suggest-task-stages', {
        taskName: title || aiContext,
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

          {/* Stages */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Stages
              </label>
              <button
                type="button"
                onClick={handleAISuggest}
                disabled={aiLoading || (!title.trim())}
                className="flex items-center gap-1.5 text-xs font-medium text-bb-green hover:text-bb-green-dark transition-colors disabled:opacity-40"
              >
                <SparklesIcon className="w-3.5 h-3.5" />
                {aiLoading ? 'Thinking...' : 'AI Suggest'}
              </button>
            </div>

            {/* Stage list */}
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

            {/* Add stage input */}
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
// Task Detail (right pane)
// ---------------------------------------------------------------------------

function TaskDetail({ task, onUpdate, onDelete }) {
  const [editingTitle, setEditingTitle]       = useState(false)
  const [titleValue, setTitleValue]           = useState(task.title)
  const [editingDesc, setEditingDesc]         = useState(false)
  const [descValue, setDescValue]             = useState(task.description || '')
  const [saving, setSaving]                   = useState(false)

  useEffect(() => {
    setTitleValue(task.title)
    setDescValue(task.description || '')
    setEditingTitle(false)
    setEditingDesc(false)
  }, [task.id])

  const isComplete = task.activeStageIndex >= (task.stages?.length || 0)
  const progress = task.stages?.length
    ? `${Math.min(task.activeStageIndex, task.stages.length)} / ${task.stages.length}`
    : 'No stages'

  async function saveTitle() {
    if (!titleValue.trim() || titleValue === task.title) {
      setEditingTitle(false)
      setTitleValue(task.title)
      return
    }
    setSaving(true)
    const updated = { ...task, title: titleValue.trim() }
    await updateDoc(doc(db, 'tasks', task.id), { title: titleValue.trim(), updated_at: new Date().toISOString() })
    onUpdate(updated)
    setSaving(false)
    setEditingTitle(false)
  }

  async function saveDesc() {
    const updated = { ...task, description: descValue }
    await updateDoc(doc(db, 'tasks', task.id), { description: descValue, updated_at: new Date().toISOString() })
    onUpdate(updated)
    setEditingDesc(false)
  }

  async function handleAdvance() {
    const newIndex = task.activeStageIndex + 1
    const newStages = task.stages.map((s, i) =>
      i === task.activeStageIndex ? { ...s, completedAt: new Date().toISOString() } : s
    )
    const updated = { ...task, stages: newStages, activeStageIndex: newIndex }
    await updateDoc(doc(db, 'tasks', task.id), {
      stages: newStages,
      activeStageIndex: newIndex,
      updated_at: new Date().toISOString(),
    })
    onUpdate(updated)
  }

  async function handleUpdateNotes(index, notes) {
    const newStages = task.stages.map((s, i) => i === index ? { ...s, notes } : s)
    const updated = { ...task, stages: newStages }
    await updateDoc(doc(db, 'tasks', task.id), { stages: newStages, updated_at: new Date().toISOString() })
    onUpdate(updated)
  }

  const stageData = {}
  task.stages?.forEach((s, i) => {
    stageData[i] = { notes: s.notes, completedAt: s.completedAt }
  })

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Task header */}
      <div className="px-6 py-5 border-b border-bb-border bg-white shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            {editingTitle ? (
              <input
                autoFocus
                value={titleValue}
                onChange={e => setTitleValue(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={e => e.key === 'Enter' && saveTitle()}
                className="input text-lg font-semibold"
              />
            ) : (
              <h2
                onClick={() => setEditingTitle(true)}
                className="text-lg font-semibold text-gray-900 cursor-text hover:text-bb-green transition-colors"
              >
                {task.title}
              </h2>
            )}

            <div className="flex items-center gap-3 mt-1">
              <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
                isComplete
                  ? 'bg-emerald-100 text-emerald-700'
                  : task.stages?.length === 0
                    ? 'bg-gray-100 text-gray-500'
                    : 'bg-bb-green-light text-bb-green'
              }`}>
                {isComplete ? (
                  <><CheckIcon className="w-3 h-3" /> Complete</>
                ) : (
                  <>Stage {task.stages?.length ? `${task.activeStageIndex + 1} of ${task.stages.length}` : '–'}</>
                )}
              </span>
              <span className="text-xs text-gray-400">
                Created {new Date(task.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
              </span>
            </div>
          </div>
          <button
            onClick={() => onDelete(task.id)}
            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
          >
            <TrashIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Description */}
        <div className="mt-3">
          {editingDesc ? (
            <div className="space-y-2">
              <textarea
                autoFocus
                value={descValue}
                onChange={e => setDescValue(e.target.value)}
                rows={3}
                placeholder="Describe this task..."
                className="input resize-none text-sm"
              />
              <div className="flex gap-2">
                <button onClick={saveDesc} className="btn-primary text-xs px-3 py-1.5">Save</button>
                <button onClick={() => { setEditingDesc(false); setDescValue(task.description || '') }} className="btn-secondary text-xs px-3 py-1.5">Cancel</button>
              </div>
            </div>
          ) : (
            <p
              onClick={() => setEditingDesc(true)}
              className={`text-sm cursor-text rounded-lg px-1 -mx-1 hover:bg-bb-light transition-colors ${task.description ? 'text-gray-600' : 'text-gray-400'}`}
            >
              {task.description || 'Click to add description...'}
            </p>
          )}
        </div>
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {!task.stages?.length ? (
          <div className="text-center py-12 text-gray-400">
            <div className="text-3xl mb-2">📋</div>
            <p className="text-sm">No stages yet.</p>
            <p className="text-xs mt-1">Edit this task to add stages.</p>
          </div>
        ) : (
          <WorkflowTimeline
            stageNames={task.stages.map(s => s.name)}
            activeIndex={task.activeStageIndex}
            stageData={stageData}
            onAdvance={handleAdvance}
            onUpdateNotes={handleUpdateNotes}
          />
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Task card (in list)
// ---------------------------------------------------------------------------

function TaskCard({ task, selected, onSelect }) {
  const stages = task.stages || []
  const done   = Math.min(task.activeStageIndex, stages.length)
  const total  = stages.length
  const pct    = total ? Math.round((done / total) * 100) : 0
  const isComplete = done >= total && total > 0

  return (
    <button
      onClick={() => onSelect(task)}
      className={`w-full text-left p-4 rounded-xl border transition-all ${
        selected
          ? 'border-bb-green bg-white shadow-card-md ring-1 ring-bb-green/20'
          : 'border-bb-border bg-white hover:border-gray-300 hover:shadow-card'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className={`text-sm font-semibold leading-tight flex-1 ${selected ? 'text-bb-green' : 'text-gray-900'}`}>
          {task.title}
        </h3>
        <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${
          isComplete
            ? 'bg-emerald-100 text-emerald-700'
            : total === 0
              ? 'bg-gray-100 text-gray-500'
              : 'bg-bb-green-light text-bb-green'
        }`}>
          {isComplete ? 'Done' : total === 0 ? 'No stages' : `${done}/${total}`}
        </span>
      </div>

      {task.description && (
        <p className="text-xs text-gray-500 truncate mb-2">{task.description}</p>
      )}

      {total > 0 && (
        <div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${isComplete ? 'bg-emerald-400' : 'bg-bb-green'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          {!isComplete && stages[task.activeStageIndex] && (
            <p className="text-xs text-gray-400 mt-1.5 truncate">
              Current: {stages[task.activeStageIndex].name}
            </p>
          )}
        </div>
      )}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Main Tasks page
// ---------------------------------------------------------------------------

export default function Tasks() {
  const [tasks, setTasks]               = useState([])
  const [loading, setLoading]           = useState(true)
  const [selected, setSelected]         = useState(null)
  const [showCreate, setShowCreate]     = useState(false)
  const [filterComplete, setFilterComplete] = useState(false)

  const loadTasks = useCallback(async () => {
    const snap = await getDocs(query(collection(db, 'tasks'), orderBy('created_at', 'desc')))
    setTasks(snap.docs.map(d => ({ ...d.data(), id: d.id })))
  }, [])

  useEffect(() => {
    loadTasks().finally(() => setLoading(false))
  }, [])

  async function handleCreate(data) {
    const ref = await addDoc(collection(db, 'tasks'), {
      ...data,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    await loadTasks()
    // Select the newly created task
    setSelected({ ...data, id: ref.id, created_at: new Date().toISOString() })
  }

  function handleUpdate(updated) {
    setTasks(prev => prev.map(t => t.id === updated.id ? updated : t))
    setSelected(updated)
  }

  async function handleDelete(id) {
    await deleteDoc(doc(db, 'tasks', id))
    setTasks(prev => prev.filter(t => t.id !== id))
    setSelected(null)
  }

  const displayed = tasks.filter(t => {
    const complete = t.activeStageIndex >= (t.stages?.length || 0) && (t.stages?.length || 0) > 0
    return filterComplete ? true : !complete
  })

  const completeCount = tasks.filter(t =>
    t.activeStageIndex >= (t.stages?.length || 0) && (t.stages?.length || 0) > 0
  ).length

  return (
    <div className="flex h-full overflow-hidden bg-bb-light">
      {/* Left pane — task list */}
      <div className="w-[320px] shrink-0 flex flex-col h-full border-r border-bb-border bg-white">
        {/* Header */}
        <div className="px-4 py-4 border-b border-bb-border">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-gray-900">
              {displayed.length} task{displayed.length !== 1 ? 's' : ''}
            </span>
            <button
              onClick={() => setShowCreate(true)}
              className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5"
            >
              <PlusIcon /> New Task
            </button>
          </div>
          <button
            onClick={() => setFilterComplete(p => !p)}
            className={`text-xs font-medium transition-colors ${filterComplete ? 'text-bb-green' : 'text-gray-400 hover:text-gray-600'}`}
          >
            {filterComplete ? 'Hiding' : 'Show'} {completeCount} complete
          </button>
        </div>

        {/* Task list */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {loading && (
            <div className="flex justify-center pt-8">
              <div className="w-5 h-5 border-2 border-bb-green border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {!loading && displayed.length === 0 && (
            <div className="text-center pt-12 text-gray-400">
              <div className="text-3xl mb-2">✅</div>
              <p className="text-sm">{tasks.length === 0 ? 'No tasks yet' : 'All done!'}</p>
            </div>
          )}
          {displayed.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              selected={selected?.id === task.id}
              onSelect={setSelected}
            />
          ))}
        </div>
      </div>

      {/* Right pane — task detail */}
      <div className="flex-1 overflow-hidden bg-bb-light">
        {selected ? (
          <div className="h-full bg-white m-4 rounded-2xl border border-bb-border shadow-card overflow-hidden">
            <TaskDetail
              key={selected.id}
              task={selected}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3">
            <div className="text-5xl">📋</div>
            <p className="text-sm font-medium text-gray-500">Select a task to view its timeline</p>
            <button onClick={() => setShowCreate(true)} className="btn-primary text-sm flex items-center gap-2 mt-2">
              <PlusIcon /> Create your first task
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
