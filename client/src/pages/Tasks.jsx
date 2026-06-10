import { useState, useEffect, useCallback } from 'react'
import {
  collection, query, orderBy, getDocs, addDoc, updateDoc, deleteDoc, doc, setDoc, getDoc,
} from 'firebase/firestore'
import { db } from '../firebase'
import { api } from '../utils/api'

const SETTINGS_DOC = 'settings/taskStages'

// ---------------------------------------------------------------------------
// AI Suggest Stages modal
// ---------------------------------------------------------------------------

function SuggestStagesModal({ onClose, onAdd }) {
  const [taskContext, setTaskContext] = useState('')
  const [loading, setLoading] = useState(false)
  const [suggestions, setSuggestions] = useState([])
  const [selected, setSelected] = useState([])

  async function handleSuggest() {
    if (!taskContext.trim()) return
    setLoading(true)
    setSuggestions([])
    setSelected([])
    try {
      const result = await api.post('/api/ai/suggest-task-stages', { taskName: taskContext })
      setSuggestions(result.stages || [])
    } catch (err) {
      console.error('Suggest error:', err)
    } finally {
      setLoading(false)
    }
  }

  function toggleSelect(stage) {
    setSelected(prev =>
      prev.includes(stage) ? prev.filter(s => s !== stage) : [...prev, stage]
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">AI Suggest Stages</h2>
        <div className="space-y-3">
          <input
            autoFocus
            placeholder="Describe what these tasks are for..."
            value={taskContext}
            onChange={e => setTaskContext(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSuggest()}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bb-green"
          />
          <button
            onClick={handleSuggest}
            disabled={loading || !taskContext.trim()}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            {loading && <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />}
            {loading ? 'Generating...' : 'Suggest Stages'}
          </button>

          {suggestions.length > 0 && (
            <div className="space-y-2 pt-1">
              <p className="text-xs text-gray-500">Click to select stages to add:</p>
              <div className="flex flex-wrap gap-2">
                {suggestions.map(s => (
                  <button
                    key={s}
                    onClick={() => toggleSelect(s)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                      selected.includes(s)
                        ? 'bg-bb-green text-white border-bb-green'
                        : 'bg-white text-gray-700 border-gray-200 hover:border-bb-green'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-4">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button
            onClick={() => { onAdd(selected); onClose() }}
            disabled={selected.length === 0}
            className="btn-primary"
          >
            Add {selected.length > 0 ? selected.length : ''} Stage{selected.length !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Tasks page
// ---------------------------------------------------------------------------

export default function Tasks() {
  const [stages, setStages] = useState([])
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [newStageName, setNewStageName] = useState('')
  const [addingStage, setAddingStage] = useState(false)
  const [showSuggest, setShowSuggest] = useState(false)
  const [newTaskInputs, setNewTaskInputs] = useState({}) // { stageId: '' }
  const [expandedTask, setExpandedTask] = useState(null)

  const loadData = useCallback(async () => {
    const [stagesSnap, tasksSnap] = await Promise.all([
      getDoc(doc(db, SETTINGS_DOC)),
      getDocs(query(collection(db, 'tasks'), orderBy('created_at', 'asc'))),
    ])
    const loadedStages = stagesSnap.exists() ? (stagesSnap.data().stages || []) : ['To Do', 'In Progress', 'Done']
    setStages(loadedStages)
    setTasks(tasksSnap.docs.map(d => ({ ...d.data(), id: d.id })))
  }, [])

  useEffect(() => {
    loadData().finally(() => setLoading(false))
  }, [])

  async function saveStages(newStages) {
    await setDoc(doc(db, SETTINGS_DOC), { stages: newStages })
    setStages(newStages)
  }

  async function handleAddStage(e) {
    e.preventDefault()
    if (!newStageName.trim()) return
    const updated = [...stages, newStageName.trim()]
    await saveStages(updated)
    setNewStageName('')
    setAddingStage(false)
  }

  async function handleAddSuggestedStages(selected) {
    if (!selected.length) return
    const existing = new Set(stages)
    const toAdd = selected.filter(s => !existing.has(s))
    if (toAdd.length) await saveStages([...stages, ...toAdd])
  }

  async function handleDeleteStage(stage) {
    const updated = stages.filter(s => s !== stage)
    await saveStages(updated)
    // Move orphaned tasks to first remaining stage
    const orphaned = tasks.filter(t => t.stage === stage)
    for (const task of orphaned) {
      await updateDoc(doc(db, 'tasks', task.id), { stage: updated[0] || 'To Do' })
    }
    await loadData()
  }

  async function handleAddTask(stage) {
    const title = (newTaskInputs[stage] || '').trim()
    if (!title) return
    await addDoc(collection(db, 'tasks'), {
      title,
      description: '',
      stage,
      created_at: new Date().toISOString(),
    })
    setNewTaskInputs(p => ({ ...p, [stage]: '' }))
    await loadData()
  }

  async function handleMoveTask(taskId, stage) {
    await updateDoc(doc(db, 'tasks', taskId), { stage, updated_at: new Date().toISOString() })
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, stage } : t))
  }

  async function handleDeleteTask(taskId) {
    await deleteDoc(doc(db, 'tasks', taskId))
    setTasks(prev => prev.filter(t => t.id !== taskId))
    if (expandedTask === taskId) setExpandedTask(null)
  }

  async function handleSaveTaskDesc(task, description) {
    await updateDoc(doc(db, 'tasks', task.id), { description })
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, description } : t))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-6 h-6 border-2 border-bb-green border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="px-6 py-3 border-b border-bb-border bg-white shrink-0 flex items-center gap-3">
        <span className="text-sm font-semibold text-gray-700">Tasks</span>
        <div className="flex-1" />
        <button
          onClick={() => setShowSuggest(true)}
          className="btn-secondary text-sm"
        >
          AI Suggest Stages
        </button>
        {addingStage ? (
          <form onSubmit={handleAddStage} className="flex items-center gap-2">
            <input
              autoFocus
              placeholder="Stage name..."
              value={newStageName}
              onChange={e => setNewStageName(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-bb-green w-40"
            />
            <button type="submit" className="btn-primary text-sm">Add</button>
            <button type="button" onClick={() => { setAddingStage(false); setNewStageName('') }} className="btn-secondary text-sm">Cancel</button>
          </form>
        ) : (
          <button onClick={() => setAddingStage(true)} className="btn-primary text-sm">
            + Add Stage
          </button>
        )}
      </div>

      {/* Stage sections */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
        {stages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-40 text-gray-400 gap-2">
            <p className="text-sm">No stages yet. Add a stage to get started.</p>
          </div>
        )}

        {stages.map(stage => {
          const stageTasks = tasks.filter(t => t.stage === stage)
          return (
            <div key={stage} className="border border-gray-200 rounded-xl overflow-hidden">
              {/* Stage header */}
              <div className="flex items-center justify-between px-4 py-2 bg-bb-light border-b border-gray-200">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-700">{stage}</span>
                  <span className="text-xs bg-white text-gray-500 border border-gray-200 rounded-full px-2 py-0.5">
                    {stageTasks.length}
                  </span>
                </div>
                <button
                  onClick={() => handleDeleteStage(stage)}
                  className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                >
                  Delete stage
                </button>
              </div>

              {/* Tasks */}
              <div className="divide-y divide-gray-100">
                {stageTasks.map(task => (
                  <div key={task.id} className="bg-white">
                    <div
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50"
                      onClick={() => setExpandedTask(expandedTask === task.id ? null : task.id)}
                    >
                      <span className="text-sm text-gray-800 flex-1 truncate">{task.title}</span>
                      <select
                        value={task.stage}
                        onChange={e => { e.stopPropagation(); handleMoveTask(task.id, e.target.value) }}
                        onClick={e => e.stopPropagation()}
                        className="text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-bb-green bg-white"
                      >
                        {stages.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <button
                        onClick={e => { e.stopPropagation(); handleDeleteTask(task.id) }}
                        className="text-gray-400 hover:text-red-500 transition-colors text-xs"
                      >
                        Delete
                      </button>
                    </div>
                    {expandedTask === task.id && (
                      <TaskExpanded task={task} onSave={handleSaveTaskDesc} />
                    )}
                  </div>
                ))}
              </div>

              {/* Add task row */}
              <div className="px-4 py-2 bg-gray-50 border-t border-gray-100">
                <form
                  onSubmit={e => { e.preventDefault(); handleAddTask(stage) }}
                  className="flex gap-2"
                >
                  <input
                    placeholder="Add task..."
                    value={newTaskInputs[stage] || ''}
                    onChange={e => setNewTaskInputs(p => ({ ...p, [stage]: e.target.value }))}
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-bb-green"
                  />
                  <button type="submit" className="btn-primary text-xs px-3">Add</button>
                </form>
              </div>
            </div>
          )
        })}
      </div>

      {showSuggest && (
        <SuggestStagesModal
          onClose={() => setShowSuggest(false)}
          onAdd={handleAddSuggestedStages}
        />
      )}
    </div>
  )
}

function TaskExpanded({ task, onSave }) {
  const [desc, setDesc] = useState(task.description || '')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    await onSave(task, desc)
    setSaving(false)
  }

  return (
    <div className="px-4 pb-3 bg-white">
      <textarea
        value={desc}
        onChange={e => setDesc(e.target.value)}
        rows={3}
        placeholder="Add notes or description..."
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bb-green resize-none"
      />
      <div className="flex justify-end mt-2">
        <button onClick={handleSave} disabled={saving} className="btn-primary text-xs">
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  )
}
