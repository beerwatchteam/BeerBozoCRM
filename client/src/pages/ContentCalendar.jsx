import { useState, useEffect, useCallback } from 'react'
import {
  collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc,
} from 'firebase/firestore'
import { db } from '../firebase'
import { addDays, startOfWeek, format, isSameDay, parseISO, isToday } from 'date-fns'

const PLATFORMS = [
  { id: 'instagram', label: 'Instagram' },
  { id: 'tiktok', label: 'TikTok' },
  { id: 'other', label: 'Other' },
]

const STATUS_COLORS = {
  planned: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  posted: 'bg-emerald-100 text-emerald-700 border-emerald-200',
}

// ---------------------------------------------------------------------------
// Add / Edit item modal
// ---------------------------------------------------------------------------

function ItemModal({ date, platform, item, onClose, onSave, onDelete }) {
  const isEdit = !!item
  const [form, setForm] = useState({
    title: item?.title || '',
    caption: item?.caption || '',
    status: item?.status || 'planned',
  })
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.title.trim()) return
    setSaving(true)
    await onSave({
      ...form,
      date: format(date, 'yyyy-MM-dd'),
      platform,
      ...(item ? { id: item.id } : {}),
    })
    setSaving(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              {isEdit ? 'Edit Post' : 'Add Post'}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {PLATFORMS.find(p => p.id === platform)?.label} — {format(date, 'EEE d MMM')}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            autoFocus
            placeholder="Post title or idea *"
            value={form.title}
            onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bb-green"
          />
          <textarea
            placeholder="Caption (optional)"
            value={form.caption}
            onChange={e => setForm(p => ({ ...p, caption: e.target.value }))}
            rows={4}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bb-green resize-none"
          />
          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-600">Status:</label>
            <div className="flex gap-2">
              {['planned', 'posted'].map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setForm(p => ({ ...p, status: s }))}
                  className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors capitalize ${
                    form.status === s
                      ? STATUS_COLORS[s]
                      : 'bg-white text-gray-500 border-gray-200'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            {isEdit ? (
              <button
                type="button"
                onClick={() => { onDelete(item.id); onClose() }}
                className="text-xs text-red-500 hover:text-red-700"
              >
                Delete
              </button>
            ) : <span />}
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={saving || !form.title.trim()} className="btn-primary">
                {saving ? 'Saving...' : isEdit ? 'Update' : 'Add Post'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Content Calendar
// ---------------------------------------------------------------------------

export default function ContentCalendar() {
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  )
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null) // { date, platform, item? }

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  const weekStartStr = format(weekStart, 'yyyy-MM-dd')
  const weekEndStr = format(addDays(weekStart, 6), 'yyyy-MM-dd')

  const loadItems = useCallback(async () => {
    setLoading(true)
    try {
      const snap = await getDocs(
        query(
          collection(db, 'contentItems'),
          where('date', '>=', weekStartStr),
          where('date', '<=', weekEndStr)
        )
      )
      setItems(snap.docs.map(d => ({ ...d.data(), id: d.id })))
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [weekStartStr, weekEndStr])

  useEffect(() => { loadItems() }, [loadItems])

  async function handleSave(data) {
    if (data.id) {
      await updateDoc(doc(db, 'contentItems', data.id), {
        title: data.title,
        caption: data.caption,
        status: data.status,
        updated_at: new Date().toISOString(),
      })
    } else {
      await addDoc(collection(db, 'contentItems'), {
        ...data,
        created_at: new Date().toISOString(),
      })
    }
    await loadItems()
  }

  async function handleDelete(id) {
    await deleteDoc(doc(db, 'contentItems', id))
    setItems(prev => prev.filter(i => i.id !== id))
  }

  function getItems(day, platform) {
    const dateStr = format(day, 'yyyy-MM-dd')
    return items.filter(i => i.date === dateStr && i.platform === platform)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Week navigation */}
      <div className="px-6 py-3 border-b border-bb-border bg-white shrink-0 flex items-center gap-4">
        <button
          onClick={() => setWeekStart(d => addDays(d, -7))}
          className="btn-secondary text-sm px-3 py-1"
        >
          ← Prev
        </button>
        <span className="text-sm font-semibold text-gray-700">
          {format(weekStart, 'd MMM')} – {format(addDays(weekStart, 6), 'd MMM yyyy')}
        </span>
        <button
          onClick={() => setWeekStart(d => addDays(d, 7))}
          className="btn-secondary text-sm px-3 py-1"
        >
          Next →
        </button>
        <button
          onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
          className="text-xs text-bb-green hover:underline"
        >
          This week
        </button>
      </div>

      {/* Calendar grid */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-6 h-6 border-2 border-bb-green border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <table className="w-full border-collapse min-w-[900px]">
            <thead>
              <tr>
                <th className="w-24 px-3 py-2 border-b border-r border-gray-200 bg-bb-light text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Platform
                </th>
                {days.map(day => (
                  <th
                    key={day.toISOString()}
                    className={`px-3 py-2 border-b border-r border-gray-200 text-center text-xs font-semibold ${
                      isToday(day) ? 'bg-bb-green text-white' : 'bg-bb-light text-gray-600'
                    }`}
                  >
                    <div>{format(day, 'EEE')}</div>
                    <div className={`text-base font-bold ${isToday(day) ? 'text-white' : 'text-gray-800'}`}>
                      {format(day, 'd')}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PLATFORMS.map((platform, pi) => (
                <tr key={platform.id} className={pi % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                  <td className="px-3 py-2 border-b border-r border-gray-200 align-top">
                    <span className="text-xs font-semibold text-gray-600">{platform.label}</span>
                  </td>
                  {days.map(day => {
                    const cellItems = getItems(day, platform.id)
                    return (
                      <td
                        key={day.toISOString()}
                        className="px-2 py-2 border-b border-r border-gray-200 align-top min-h-[80px] w-[calc((100%-96px)/7)]"
                      >
                        <div className="space-y-1">
                          {cellItems.map(item => (
                            <button
                              key={item.id}
                              onClick={() => setModal({ date: day, platform: platform.id, item })}
                              className={`w-full text-left text-xs px-2 py-1.5 rounded border transition-colors ${STATUS_COLORS[item.status] || STATUS_COLORS.planned}`}
                            >
                              <span className="truncate block font-medium">{item.title}</span>
                            </button>
                          ))}
                          <button
                            onClick={() => setModal({ date: day, platform: platform.id })}
                            className="w-full text-left text-xs text-gray-400 hover:text-bb-green px-2 py-1 rounded hover:bg-bb-light transition-colors"
                          >
                            + Add
                          </button>
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Legend */}
      <div className="px-6 py-2 border-t border-bb-border bg-white shrink-0 flex items-center gap-4">
        {Object.entries(STATUS_COLORS).map(([status, cls]) => (
          <div key={status} className="flex items-center gap-1.5">
            <span className={`inline-block w-3 h-3 rounded border ${cls}`} />
            <span className="text-xs text-gray-500 capitalize">{status}</span>
          </div>
        ))}
      </div>

      {modal && (
        <ItemModal
          date={modal.date}
          platform={modal.platform}
          item={modal.item}
          onClose={() => setModal(null)}
          onSave={handleSave}
          onDelete={handleDelete}
        />
      )}
    </div>
  )
}
