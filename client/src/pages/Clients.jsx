import { useState, useEffect, useCallback, useRef } from 'react'
import {
  collection, query, orderBy, getDocs, addDoc, updateDoc, deleteDoc, doc, where, limit,
} from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL, listAll } from 'firebase/storage'
import { db, storage, auth } from '../firebase'
import { api } from '../utils/api'
import WorkflowTimeline from '../components/WorkflowTimeline'
import { PlusIcon, SparklesIcon, TrashIcon, PaperclipIcon } from '../components/Icons'

const ADVERTISER_STAGES = [
  'Initial Contact',
  'Awaiting Response',
  'Deal Discussion',
  'Deal Agreed',
  'Awaiting Assets',
  'Invoice Sent / Awaiting Payment',
  'Live & Active',
  'Completed',
]

// ---------------------------------------------------------------------------
// Add Client modal
// ---------------------------------------------------------------------------

function AddClientModal({ onClose, onSave }) {
  const [form, setForm] = useState({ name: '', company: '', email: '', phone: '' })
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    await onSave(form)
    setSaving(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-card-lg w-full max-w-md mx-4 overflow-hidden">
        <div className="px-6 py-5 border-b border-bb-border">
          <h2 className="text-base font-semibold text-gray-900">Add Client</h2>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-3">
          <input autoFocus placeholder="Name *" value={form.name}
            onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className="input" />
          <input placeholder="Company" value={form.company}
            onChange={e => setForm(p => ({ ...p, company: e.target.value }))} className="input" />
          <input placeholder="Email" type="email" value={form.email}
            onChange={e => setForm(p => ({ ...p, email: e.target.value }))} className="input" />
          <input placeholder="Phone" value={form.phone}
            onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} className="input" />
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving || !form.name.trim()} className="btn-primary">
              {saving ? 'Saving...' : 'Add Client'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Client detail — right pane
// ---------------------------------------------------------------------------

function ClientDetail({ client, onUpdate, userEmails, allTasks, onCreateTask }) {
  const [activeTab, setActiveTab]       = useState('workflow')
  const [nextAction, setNextAction]     = useState(client.next_action || '')
  const [savingAction, setSavingAction] = useState(false)
  const [suggestingAI, setSuggestingAI] = useState(false)
  const [notes, setNotes]               = useState(client.notes || '')
  const [savingNotes, setSavingNotes]   = useState(false)
  const [docs, setDocs]                 = useState([])
  const [docsLoading, setDocsLoading]   = useState(false)
  const [uploading, setUploading]       = useState(false)
  const fileRef                         = useRef(null)

  useEffect(() => {
    setNextAction(client.next_action || '')
    setNotes(client.notes || '')
    setActiveTab('workflow')
  }, [client.id])

  useEffect(() => {
    if (activeTab === 'documents') loadDocs()
  }, [activeTab, client.id])

  const stageIndex = ADVERTISER_STAGES.indexOf(client.stage)
  const activeIndex = stageIndex === -1 ? 0 : stageIndex

  // Linked emails: match from_email, from_name, subject or snippet against client identifiers
  const linkedEmails = userEmails.filter(e => {
    const needles = [client.email, client.company, client.name].filter(Boolean).map(s => s.toLowerCase())
    const haystack = [e.from_email, e.from_name, e.subject, e.snippet].filter(Boolean).join(' ').toLowerCase()
    return needles.some(n => n.length > 2 && haystack.includes(n))
  })

  // Linked tasks
  const linkedTasks = allTasks.filter(t => t.client_id === client.id)

  async function handleStageClick(i) {
    const stage = ADVERTISER_STAGES[i]
    const updated = { ...client, stage }
    await updateDoc(doc(db, 'clients', client.id), { stage, updated_at: new Date().toISOString() })
    onUpdate(updated)
  }

  async function handleSaveAction() {
    setSavingAction(true)
    await updateDoc(doc(db, 'clients', client.id), { next_action: nextAction, updated_at: new Date().toISOString() })
    onUpdate({ ...client, next_action: nextAction })
    setSavingAction(false)
  }

  async function handleAISuggest() {
    setSuggestingAI(true)
    try {
      const snippets = linkedEmails.slice(0, 3).map(e => e.snippet).filter(Boolean)
      const result = await api.post('/api/ai/suggest-next-action', {
        clientName: client.name,
        stage: client.stage,
        notes: client.notes,
        recentEmailSnippets: snippets,
      })
      setNextAction(result.suggestion)
    } catch (err) {
      console.error(err)
    } finally {
      setSuggestingAI(false)
    }
  }

  async function handleSaveNotes() {
    setSavingNotes(true)
    await updateDoc(doc(db, 'clients', client.id), { notes, updated_at: new Date().toISOString() })
    onUpdate({ ...client, notes })
    setSavingNotes(false)
  }

  async function loadDocs() {
    setDocsLoading(true)
    try {
      const listRef = ref(storage, `clients/${client.id}/documents`)
      const result = await listAll(listRef)
      const items = await Promise.all(
        result.items.map(async item => ({
          name: item.name,
          url: await getDownloadURL(item),
        }))
      )
      setDocs(items)
    } catch { setDocs([]) }
    finally { setDocsLoading(false) }
  }

  async function handleUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const storageRef = ref(storage, `clients/${client.id}/documents/${Date.now()}_${file.name}`)
      await uploadBytes(storageRef, file)
      await loadDocs()
    } catch (err) { console.error(err) }
    finally { setUploading(false); e.target.value = '' }
  }

  const TABS = [
    { id: 'workflow', label: 'Workflow' },
    { id: 'emails',   label: `Emails${linkedEmails.length ? ` (${linkedEmails.length})` : ''}` },
    { id: 'tasks',    label: `Tasks${linkedTasks.length ? ` (${linkedTasks.length})` : ''}` },
    { id: 'notes',    label: 'Notes' },
    { id: 'documents', label: 'Documents' },
  ]

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Client header */}
      <div className="px-6 py-5 border-b border-bb-border bg-white shrink-0">
        <div className="flex items-start gap-4">
          {/* Avatar */}
          <div className="w-12 h-12 rounded-xl bg-bb-green flex items-center justify-center text-white text-lg font-bold shrink-0">
            {client.name?.[0]?.toUpperCase() || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-gray-900">{client.name}</h2>
            {client.company && <p className="text-sm text-gray-600">{client.company}</p>}
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              {client.email && <span className="text-xs text-gray-400">{client.email}</span>}
              {client.phone && <span className="text-xs text-gray-400">{client.phone}</span>}
            </div>
          </div>
          {/* Stage badge */}
          <div className="shrink-0">
            <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold bg-bb-green-light text-bb-green border border-bb-green/20">
              {client.stage || ADVERTISER_STAGES[0]}
            </span>
          </div>
        </div>

        {/* Next action prominently below header */}
        {client.next_action && (
          <div className="mt-4 flex items-start gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
            <span className="text-amber-500 text-base mt-0.5">→</span>
            <div>
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-0.5">Next action</p>
              <p className="text-sm text-amber-900">{client.next_action}</p>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="px-6 border-b border-bb-border bg-white shrink-0">
        <div className="flex gap-0">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-bb-green text-bb-green'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto bg-bb-light">
        {/* ── Workflow ─────────────────────────────────── */}
        {activeTab === 'workflow' && (
          <div className="p-6 space-y-6">
            {/* Next action editor */}
            <div className="card p-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Next Action</p>
              <div className="flex gap-2">
                <input
                  value={nextAction}
                  onChange={e => setNextAction(e.target.value)}
                  placeholder="What needs to happen next with this client?"
                  className="input flex-1"
                />
                <button
                  onClick={handleAISuggest}
                  disabled={suggestingAI}
                  className="btn-secondary flex items-center gap-1.5 text-xs whitespace-nowrap"
                >
                  <SparklesIcon />
                  {suggestingAI ? 'Thinking...' : 'AI Suggest'}
                </button>
                <button onClick={handleSaveAction} disabled={savingAction} className="btn-primary text-xs whitespace-nowrap">
                  {savingAction ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>

            {/* Workflow pipeline */}
            <div className="card p-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">
                Advertiser Pipeline
              </p>
              <WorkflowTimeline
                stageNames={ADVERTISER_STAGES}
                activeIndex={activeIndex}
                onStageClick={handleStageClick}
              />
            </div>
          </div>
        )}

        {/* ── Emails ───────────────────────────────────── */}
        {activeTab === 'emails' && (
          <div className="p-6 space-y-2">
            {linkedEmails.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <div className="text-3xl mb-2">📭</div>
                <p className="text-sm">No linked emails found</p>
                <p className="text-xs mt-1 text-gray-400">Emails are matched by client name, company, or email address</p>
              </div>
            ) : linkedEmails.map(e => (
              <div key={e.id} className="card p-4">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className="text-sm font-semibold text-gray-900 truncate">{e.subject || '(No subject)'}</span>
                  <span className="text-xs text-gray-400 shrink-0">
                    {e.date ? new Date(e.date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : ''}
                  </span>
                </div>
                <p className="text-xs text-gray-600 truncate">{e.from_name || e.from_email}</p>
                {e.snippet && <p className="text-xs text-gray-400 truncate mt-1">{e.snippet}</p>}
              </div>
            ))}
          </div>
        )}

        {/* ── Tasks ────────────────────────────────────── */}
        {activeTab === 'tasks' && (
          <div className="p-6 space-y-3">
            <div className="flex justify-end">
              <button
                onClick={() => onCreateTask(client.id)}
                className="btn-primary text-xs flex items-center gap-1.5"
              >
                <PlusIcon /> New Task
              </button>
            </div>
            {linkedTasks.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <div className="text-3xl mb-2">✅</div>
                <p className="text-sm">No tasks linked to this client</p>
              </div>
            ) : linkedTasks.map(task => {
              const done  = Math.min(task.activeStageIndex, task.stages?.length || 0)
              const total = task.stages?.length || 0
              const pct   = total ? Math.round((done / total) * 100) : 0
              const complete = done >= total && total > 0
              return (
                <div key={task.id} className="card p-4">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-sm font-semibold text-gray-900">{task.title}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      complete ? 'bg-emerald-100 text-emerald-700' : 'bg-bb-green-light text-bb-green'
                    }`}>
                      {complete ? 'Done' : total === 0 ? 'No stages' : `${done}/${total}`}
                    </span>
                  </div>
                  {total > 0 && (
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${complete ? 'bg-emerald-400' : 'bg-bb-green'}`}
                        style={{ width: `${pct}%` }} />
                    </div>
                  )}
                  {!complete && task.stages?.[task.activeStageIndex] && (
                    <p className="text-xs text-gray-400 mt-1.5">
                      Current: {task.stages[task.activeStageIndex].name}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* ── Notes ────────────────────────────────────── */}
        {activeTab === 'notes' && (
          <div className="p-6 space-y-3">
            <div className="card p-5">
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={12}
                placeholder="Add notes about this client..."
                className="input resize-none w-full"
              />
              <div className="flex justify-end mt-3">
                <button onClick={handleSaveNotes} disabled={savingNotes} className="btn-primary">
                  {savingNotes ? 'Saving...' : 'Save Notes'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Documents ────────────────────────────────── */}
        {activeTab === 'documents' && (
          <div className="p-6 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">
                {docsLoading ? 'Loading...' : `${docs.length} document${docs.length !== 1 ? 's' : ''}`}
              </p>
              <div>
                <input ref={fileRef} type="file" onChange={handleUpload} className="hidden" />
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="btn-primary flex items-center gap-1.5"
                >
                  <PaperclipIcon />
                  {uploading ? 'Uploading...' : 'Upload File'}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              {docs.map(d => (
                <a key={d.name} href={d.url} target="_blank" rel="noopener noreferrer"
                  className="card flex items-center gap-3 p-4 hover:shadow-card-md transition-shadow">
                  <div className="w-8 h-8 bg-bb-green-light rounded-lg flex items-center justify-center">
                    <PaperclipIcon className="w-4 h-4 text-bb-green" />
                  </div>
                  <span className="text-sm text-gray-700 truncate">{d.name.replace(/^\d+_/, '')}</span>
                </a>
              ))}
              {!docsLoading && docs.length === 0 && (
                <div className="text-center py-12 text-gray-400">
                  <div className="text-3xl mb-2">📎</div>
                  <p className="text-sm">No documents yet</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Stage progress pill
// ---------------------------------------------------------------------------

const STAGE_COLORS = {
  'Initial Contact': 'bg-gray-100 text-gray-600',
  'Awaiting Response': 'bg-yellow-100 text-yellow-700',
  'Deal Discussion': 'bg-blue-100 text-blue-700',
  'Deal Agreed': 'bg-indigo-100 text-indigo-700',
  'Awaiting Assets': 'bg-purple-100 text-purple-700',
  'Invoice Sent / Awaiting Payment': 'bg-orange-100 text-orange-700',
  'Live & Active': 'bg-emerald-100 text-emerald-700',
  'Completed': 'bg-green-200 text-green-800',
}

// ---------------------------------------------------------------------------
// Main Clients page
// ---------------------------------------------------------------------------

export default function Clients() {
  const [clients, setClients]           = useState([])
  const [loading, setLoading]           = useState(true)
  const [selected, setSelected]         = useState(null)
  const [showAdd, setShowAdd]           = useState(false)
  const [search, setSearch]             = useState('')
  const [userEmails, setUserEmails]     = useState([])
  const [allTasks, setAllTasks]         = useState([])
  const [showCreateTask, setShowCreateTask] = useState(false)
  const [newTaskClientId, setNewTaskClientId] = useState(null)

  const loadClients = useCallback(async () => {
    const snap = await getDocs(query(collection(db, 'clients'), orderBy('created_at', 'desc')))
    setClients(snap.docs.map(d => ({ ...d.data(), id: d.id })))
  }, [])

  const loadEmails = useCallback(async () => {
    const uid = auth.currentUser?.uid
    if (!uid) return
    try {
      const snap = await getDocs(
        query(collection(db, `users/${uid}/emails`), orderBy('date', 'desc'), limit(200))
      )
      setUserEmails(snap.docs.map(d => ({ ...d.data(), id: d.id })))
    } catch { setUserEmails([]) }
  }, [])

  const loadTasks = useCallback(async () => {
    try {
      const snap = await getDocs(query(collection(db, 'tasks'), orderBy('created_at', 'desc')))
      setAllTasks(snap.docs.map(d => ({ ...d.data(), id: d.id })))
    } catch { setAllTasks([]) }
  }, [])

  useEffect(() => {
    Promise.all([loadClients(), loadEmails(), loadTasks()]).finally(() => setLoading(false))
  }, [])

  async function handleAddClient(form) {
    await addDoc(collection(db, 'clients'), {
      ...form,
      stage: ADVERTISER_STAGES[0],
      next_action: '',
      notes: '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    await loadClients()
  }

  function handleUpdateClient(updated) {
    setClients(prev => prev.map(c => c.id === updated.id ? updated : c))
    setSelected(updated)
  }

  function handleCreateTaskForClient(clientId) {
    setNewTaskClientId(clientId)
    setShowCreateTask(true)
  }

  const filtered = clients.filter(c => {
    const q = search.toLowerCase()
    return !q || [c.name, c.company, c.email].filter(Boolean).some(s => s.toLowerCase().includes(q))
  })

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Left pane — client list ────────────────── */}
      <div className="w-[280px] shrink-0 flex flex-col h-full bg-white border-r border-bb-border">
        <div className="px-4 py-4 border-b border-bb-border space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-900">{clients.length} clients</span>
            <button onClick={() => setShowAdd(true)} className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5">
              <PlusIcon /> Add
            </button>
          </div>
          <input
            placeholder="Search clients..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input"
          />
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {loading && (
            <div className="flex justify-center pt-8">
              <div className="w-5 h-5 border-2 border-bb-green border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="text-center pt-12 text-gray-400">
              <p className="text-sm">{search ? 'No results' : 'No clients yet'}</p>
            </div>
          )}
          {filtered.map(client => (
            <button
              key={client.id}
              onClick={() => setSelected(client)}
              className={`w-full text-left px-3 py-3 rounded-xl transition-all ${
                selected?.id === client.id
                  ? 'bg-bb-green-light border border-bb-green/30 shadow-sm'
                  : 'hover:bg-gray-50 border border-transparent'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 ${
                  selected?.id === client.id ? 'bg-bb-green text-white' : 'bg-gray-100 text-gray-600'
                }`}>
                  {client.name?.[0]?.toUpperCase() || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{client.name}</p>
                  {client.company && <p className="text-xs text-gray-500 truncate">{client.company}</p>}
                </div>
              </div>
              <div className="mt-2 ml-12">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STAGE_COLORS[client.stage] || 'bg-gray-100 text-gray-500'}`}>
                  {client.stage || ADVERTISER_STAGES[0]}
                </span>
                {client.next_action && (
                  <p className="text-xs text-amber-600 truncate mt-1">→ {client.next_action}</p>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Right pane — client detail ─────────────── */}
      <div className="flex-1 overflow-hidden bg-bb-light">
        {selected ? (
          <div className="h-full bg-white overflow-hidden">
            <ClientDetail
              key={selected.id}
              client={selected}
              onUpdate={handleUpdateClient}
              userEmails={userEmails}
              allTasks={allTasks}
              onCreateTask={handleCreateTaskForClient}
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3">
            <div className="text-5xl">🤝</div>
            <p className="text-sm font-medium text-gray-500">Select a client to view details</p>
            <button onClick={() => setShowAdd(true)} className="btn-primary text-sm flex items-center gap-2 mt-2">
              <PlusIcon /> Add your first client
            </button>
          </div>
        )}
      </div>

      {showAdd && (
        <AddClientModal onClose={() => setShowAdd(false)} onSave={handleAddClient} />
      )}

      {showCreateTask && (
        <CreateTaskForClientModal
          clientId={newTaskClientId}
          onClose={() => { setShowCreateTask(false); setNewTaskClientId(null) }}
          onSaved={() => { loadTasks(); setShowCreateTask(false) }}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Quick task creation from client page
// ---------------------------------------------------------------------------

function CreateTaskForClientModal({ clientId, onClose, onSaved }) {
  const [title, setTitle]     = useState('')
  const [stages, setStages]   = useState([])
  const [stageInput, setStageInput] = useState('')
  const [aiLoading, setAiLoading]   = useState(false)
  const [saving, setSaving]   = useState(false)

  async function handleAI() {
    if (!title.trim()) return
    setAiLoading(true)
    try {
      const result = await api.post('/api/ai/suggest-task-stages', { taskName: title })
      setStages(result.stages || [])
    } catch (err) { console.error(err) }
    finally { setAiLoading(false) }
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    await addDoc(collection(db, 'tasks'), {
      title: title.trim(),
      description: '',
      stages: stages.map(name => ({ name, notes: '', completedAt: null })),
      activeStageIndex: 0,
      client_id: clientId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    setSaving(false)
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-card-lg w-full max-w-md mx-4 overflow-hidden">
        <div className="px-6 py-5 border-b border-bb-border">
          <h2 className="text-base font-semibold text-gray-900">New Task for Client</h2>
        </div>
        <form onSubmit={handleSave} className="px-6 py-5 space-y-4">
          <input autoFocus value={title} onChange={e => setTitle(e.target.value)}
            placeholder="Task title *" className="input" />

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Stages</span>
              <button type="button" onClick={handleAI} disabled={aiLoading || !title.trim()}
                className="text-xs text-bb-green flex items-center gap-1 disabled:opacity-40">
                <SparklesIcon className="w-3.5 h-3.5" />
                {aiLoading ? 'Thinking...' : 'AI Suggest'}
              </button>
            </div>
            {stages.map((s, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-1.5 bg-bb-light rounded-lg mb-1 border border-bb-border">
                <span className="text-xs font-bold text-gray-400">{i + 1}</span>
                <span className="text-sm flex-1">{s}</span>
                <button type="button" onClick={() => setStages(p => p.filter((_, idx) => idx !== i))}
                  className="text-gray-300 hover:text-red-400"><TrashIcon /></button>
              </div>
            ))}
            <div className="flex gap-2">
              <input value={stageInput} onChange={e => setStageInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (stageInput.trim()) { setStages(p => [...p, stageInput.trim()]); setStageInput('') } } }}
                placeholder="Add stage..." className="input flex-1" />
              <button type="button" onClick={() => { if (stageInput.trim()) { setStages(p => [...p, stageInput.trim()]); setStageInput('') } }}
                className="btn-secondary px-3"><PlusIcon /></button>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
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
