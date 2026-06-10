import { useState, useEffect, useCallback, useRef } from 'react'
import {
  collection, query, orderBy, getDocs, addDoc, updateDoc, doc,
  where, limit,
} from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL, listAll } from 'firebase/storage'
import { db, storage, auth } from '../firebase'
import { api } from '../utils/api'

const STAGES = [
  'Initial Contact',
  'Awaiting Response',
  'Deal Discussion',
  'Deal Agreed',
  'Awaiting Assets',
  'Invoice Sent / Awaiting Payment',
  'Live & Active',
  'Completed',
]

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

function StageBadge({ stage }) {
  const cls = STAGE_COLORS[stage] || 'bg-gray-100 text-gray-600'
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {stage}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Add Client Modal
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Add Client</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            autoFocus
            placeholder="Name *"
            value={form.name}
            onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bb-green"
          />
          <input
            placeholder="Company"
            value={form.company}
            onChange={e => setForm(p => ({ ...p, company: e.target.value }))}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bb-green"
          />
          <input
            placeholder="Email"
            type="email"
            value={form.email}
            onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bb-green"
          />
          <input
            placeholder="Phone"
            value={form.phone}
            onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bb-green"
          />
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
// Client Detail
// ---------------------------------------------------------------------------

function ClientDetail({ client, onUpdate, userEmails }) {
  const [activeTab, setActiveTab] = useState('emails')
  const [nextAction, setNextAction] = useState(client.next_action || '')
  const [suggestingAction, setSuggestingAction] = useState(false)
  const [savingAction, setSavingAction] = useState(false)
  const [notes, setNotes] = useState(client.notes || '')
  const [savingNotes, setSavingNotes] = useState(false)
  const [docs, setDocs] = useState([])
  const [docsLoading, setDocsLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef(null)

  // Reset when client changes
  useEffect(() => {
    setNextAction(client.next_action || '')
    setNotes(client.notes || '')
    setActiveTab('emails')
  }, [client.id])

  useEffect(() => {
    if (activeTab === 'documents') loadDocs()
  }, [activeTab, client.id])

  // Linked emails: match client email or company name against from_email/subject/snippet
  const linkedEmails = userEmails.filter(e => {
    const needle = [client.email, client.company, client.name]
      .filter(Boolean)
      .map(s => s.toLowerCase())
    const hay = [e.from_email, e.from_name, e.subject, e.snippet]
      .filter(Boolean)
      .map(s => s.toLowerCase())
      .join(' ')
    return needle.some(n => n.length > 2 && hay.includes(n))
  })

  async function handleStageChange(stage) {
    await updateDoc(doc(db, 'clients', client.id), { stage, updated_at: new Date().toISOString() })
    onUpdate({ ...client, stage })
  }

  async function handleSaveAction() {
    setSavingAction(true)
    await updateDoc(doc(db, 'clients', client.id), { next_action: nextAction, updated_at: new Date().toISOString() })
    onUpdate({ ...client, next_action: nextAction })
    setSavingAction(false)
  }

  async function handleAISuggestAction() {
    setSuggestingAction(true)
    try {
      const recentSnippets = linkedEmails.slice(0, 3).map(e => e.snippet).filter(Boolean)
      const result = await api.post('/api/ai/suggest-next-action', {
        clientName: client.name,
        stage: client.stage,
        notes: client.notes,
        recentEmailSnippets: recentSnippets,
      })
      setNextAction(result.suggestion)
    } catch (err) {
      console.error('AI suggest error:', err)
    } finally {
      setSuggestingAction(false)
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
          ref: item,
        }))
      )
      setDocs(items)
    } catch {
      setDocs([])
    } finally {
      setDocsLoading(false)
    }
  }

  async function handleFileUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const storageRef = ref(storage, `clients/${client.id}/documents/${Date.now()}_${file.name}`)
      await uploadBytes(storageRef, file)
      await loadDocs()
    } catch (err) {
      console.error('Upload error:', err)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const TABS = ['emails', 'notes', 'documents']

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-bb-border bg-white shrink-0">
        <div className="flex items-start justify-between gap-2 mb-1">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{client.name}</h2>
            {client.company && <p className="text-sm text-gray-500">{client.company}</p>}
            {client.email && <p className="text-xs text-gray-400">{client.email}</p>}
          </div>
        </div>
      </div>

      {/* Stage pipeline */}
      <div className="px-6 py-3 border-b border-bb-border bg-bb-light shrink-0 overflow-x-auto">
        <div className="flex items-center gap-1 min-w-max">
          {STAGES.map((stage, i) => (
            <button
              key={stage}
              onClick={() => handleStageChange(stage)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                client.stage === stage
                  ? 'bg-bb-green text-white shadow-sm'
                  : 'bg-white text-gray-600 border border-gray-200 hover:border-bb-green hover:text-bb-green'
              }`}
            >
              {i + 1}. {stage}
            </button>
          ))}
        </div>
      </div>

      {/* Next action */}
      <div className="px-6 py-3 border-b border-bb-border shrink-0">
        <p className="text-xs font-semibold text-bb-green uppercase tracking-wide mb-1.5">Next Action</p>
        <div className="flex gap-2">
          <input
            value={nextAction}
            onChange={e => setNextAction(e.target.value)}
            placeholder="What needs to happen next?"
            className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-bb-green"
          />
          <button
            onClick={handleAISuggestAction}
            disabled={suggestingAction}
            className="btn-secondary flex items-center gap-1.5 text-xs"
          >
            {suggestingAction && (
              <div className="w-3 h-3 border border-bb-green border-t-transparent rounded-full animate-spin" />
            )}
            AI Suggest
          </button>
          <button
            onClick={handleSaveAction}
            disabled={savingAction}
            className="btn-primary text-xs"
          >
            {savingAction ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-6 pt-3 border-b border-bb-border shrink-0">
        <div className="flex gap-4">
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-2 text-sm font-medium capitalize border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-bb-green text-bb-green'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab}
              {tab === 'emails' && linkedEmails.length > 0 && (
                <span className="ml-1.5 text-xs bg-bb-light text-bb-green rounded-full px-1.5 py-0.5">
                  {linkedEmails.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'emails' && (
          <div className="space-y-2">
            {linkedEmails.length === 0 ? (
              <p className="text-sm text-gray-400">No linked emails found</p>
            ) : (
              linkedEmails.map(e => (
                <div key={e.id} className="border border-gray-100 rounded-lg px-4 py-3">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="text-sm font-medium text-gray-800 truncate">{e.subject || '(No subject)'}</span>
                    <span className="text-xs text-gray-400 shrink-0">
                      {e.date ? new Date(e.date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : ''}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 truncate">{e.snippet}</p>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'notes' && (
          <div className="space-y-3">
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={10}
              placeholder="Add notes about this client..."
              className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-bb-green resize-none"
            />
            <div className="flex justify-end">
              <button onClick={handleSaveNotes} disabled={savingNotes} className="btn-primary text-sm">
                {savingNotes ? 'Saving...' : 'Save Notes'}
              </button>
            </div>
          </div>
        )}

        {activeTab === 'documents' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-600">
                {docsLoading ? 'Loading...' : `${docs.length} document${docs.length !== 1 ? 's' : ''}`}
              </p>
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="btn-primary text-sm flex items-center gap-1.5"
                >
                  {uploading && (
                    <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                  )}
                  {uploading ? 'Uploading...' : 'Upload File'}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              {docs.map(d => (
                <a
                  key={d.name}
                  href={d.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 border border-gray-100 rounded-lg px-4 py-3 hover:bg-bb-light transition-colors"
                >
                  <span className="text-lg">📄</span>
                  <span className="text-sm text-gray-700 truncate">{d.name.replace(/^\d+_/, '')}</span>
                </a>
              ))}
              {!docsLoading && docs.length === 0 && (
                <p className="text-sm text-gray-400">No documents uploaded yet</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Clients page
// ---------------------------------------------------------------------------

export default function Clients() {
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedClient, setSelectedClient] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [search, setSearch] = useState('')
  const [userEmails, setUserEmails] = useState([])

  const loadClients = useCallback(async () => {
    const snap = await getDocs(query(collection(db, 'clients'), orderBy('created_at', 'desc')))
    const list = snap.docs.map(d => ({ ...d.data(), id: d.id }))
    setClients(list)
  }, [])

  const loadUserEmails = useCallback(async () => {
    const uid = auth.currentUser?.uid
    if (!uid) return
    try {
      const snap = await getDocs(
        query(collection(db, `users/${uid}/emails`), orderBy('date', 'desc'), limit(200))
      )
      setUserEmails(snap.docs.map(d => ({ ...d.data(), id: d.id })))
    } catch {
      setUserEmails([])
    }
  }, [])

  useEffect(() => {
    Promise.all([loadClients(), loadUserEmails()]).finally(() => setLoading(false))
  }, [])

  async function handleAddClient(form) {
    await addDoc(collection(db, 'clients'), {
      ...form,
      stage: STAGES[0],
      next_action: '',
      notes: '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    await loadClients()
  }

  function handleUpdateClient(updated) {
    setClients(prev => prev.map(c => c.id === updated.id ? updated : c))
    setSelectedClient(updated)
  }

  const filtered = clients.filter(c => {
    const q = search.toLowerCase()
    return !q || [c.name, c.company, c.email].filter(Boolean).some(s => s.toLowerCase().includes(q))
  })

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left pane — client list */}
      <div className="w-72 shrink-0 border-r border-bb-border flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-bb-border bg-white shrink-0 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-700">Clients</span>
            <button onClick={() => setShowAdd(true)} className="btn-primary text-xs px-3 py-1">
              + Add
            </button>
          </div>
          <input
            placeholder="Search..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-bb-green"
          />
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex justify-center items-center h-20">
              <div className="w-4 h-4 border-2 border-bb-green border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="flex items-center justify-center h-20 text-sm text-gray-400">
              {search ? 'No results' : 'No clients yet'}
            </div>
          )}
          {filtered.map(client => (
            <button
              key={client.id}
              onClick={() => setSelectedClient(client)}
              className={`w-full text-left px-4 py-3 border-b border-gray-100 transition-colors ${
                selectedClient?.id === client.id
                  ? 'bg-bb-light border-l-2 border-l-bb-green'
                  : 'hover:bg-gray-50'
              }`}
            >
              <p className="text-sm font-medium text-gray-900 truncate">{client.name}</p>
              {client.company && (
                <p className="text-xs text-gray-500 truncate">{client.company}</p>
              )}
              <div className="mt-1">
                <StageBadge stage={client.stage} />
              </div>
              {client.next_action && (
                <p className="text-xs text-gray-400 truncate mt-1">{client.next_action}</p>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Right pane — client detail */}
      <div className="flex-1 overflow-hidden bg-white">
        {selectedClient ? (
          <ClientDetail
            key={selectedClient.id}
            client={selectedClient}
            onUpdate={handleUpdateClient}
            userEmails={userEmails}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3">
            <div className="text-4xl">🤝</div>
            <p className="text-sm font-medium text-gray-500">Select a client to view details</p>
            <p className="text-xs">{clients.length} client{clients.length !== 1 ? 's' : ''} total</p>
          </div>
        )}
      </div>

      {showAdd && (
        <AddClientModal onClose={() => setShowAdd(false)} onSave={handleAddClient} />
      )}
    </div>
  )
}
