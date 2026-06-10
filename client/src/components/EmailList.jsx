import { formatDistanceToNow, parseISO } from 'date-fns'

const FILTERS = [
  { id: 'all',        label: 'All'        },
  { id: 'advertiser', label: 'Advertiser' },
  { id: 'collab',     label: 'Collab'     },
  { id: 'investor',   label: 'Investor'   },
  { id: 'financial',  label: 'Financial'  },
  { id: 'platform',   label: 'Platform'   },
  { id: 'outreach',   label: 'Outreach'   },
]

const CATEGORY_COLORS = {
  collab:     'bg-emerald-100 text-emerald-700',
  investor:   'bg-blue-100 text-blue-700',
  advertiser: 'bg-purple-100 text-purple-700',
  platform:   'bg-gray-100 text-gray-600',
  financial:  'bg-yellow-100 text-yellow-700',
  outreach:   'bg-orange-100 text-orange-700',
}

function formatDate(dateStr) {
  try {
    const date = new Date(dateStr)
    if (isNaN(date)) return dateStr
    return formatDistanceToNow(date, { addSuffix: true })
  } catch {
    return dateStr
  }
}

export default function EmailList({ emails, selectedId, onSelect, filter, onFilterChange, syncing }) {
  const filtered = filter === 'all' ? emails : emails.filter((e) => e.category === filter)

  return (
    <div className="flex flex-col h-full">
      {/* Filters */}
      <div className="px-3 pt-3 pb-2 border-b border-bb-border bg-white shrink-0">
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => onFilterChange(f.id)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                filter === f.id
                  ? 'bg-bb-green text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {syncing && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center h-32 text-sm text-gray-400 gap-2">
            <div className="w-4 h-4 border-2 border-bb-green border-t-transparent rounded-full animate-spin" />
            Syncing emails...
          </div>
        )}

        {!syncing && filtered.length === 0 && (
          <div className="flex items-center justify-center h-32 text-sm text-gray-400">
            No emails in this category
          </div>
        )}

        {filtered.map((email) => {
          const isSelected = email.id === selectedId || email.gmail_id === selectedId
          const isUnread = email.is_read === 0

          return (
            <button
              key={email.gmail_id || email.id}
              onClick={() => onSelect(email)}
              className={`w-full text-left px-3 py-3 border-b border-gray-100 transition-colors ${
                isSelected
                  ? 'bg-bb-green-light border-l-2 border-l-bb-green'
                  : 'hover:bg-gray-50'
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-0.5">
                <span className={`text-xs truncate flex-1 ${isUnread ? 'font-semibold text-gray-900' : 'font-medium text-gray-600'}`}>
                  {email.from_name || email.from_email || 'Unknown sender'}
                </span>
                <span className="text-[11px] text-gray-400 shrink-0">{formatDate(email.date)}</span>
              </div>

              <div className={`text-sm truncate mb-1 leading-tight ${isUnread ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>
                {email.subject || '(No subject)'}
              </div>

              <div className="flex items-center gap-1.5">
                {isUnread && <span className="w-1.5 h-1.5 rounded-full bg-bb-green shrink-0" />}
                <span className={`category-badge text-[10px] px-1.5 py-0.5 ${CATEGORY_COLORS[email.category] || CATEGORY_COLORS.outreach}`}>
                  {email.category}
                </span>
                <span className="text-xs text-gray-400 truncate flex-1">{email.snippet}</span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
