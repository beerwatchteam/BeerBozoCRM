export default function StatsCards({ stats }) {
  const cards = [
    { label: 'Total',       value: stats?.total      ?? '—', color: 'text-gray-900' },
    { label: 'Unread',      value: stats?.unread     ?? '—', color: stats?.unread > 0 ? 'text-bb-green' : 'text-gray-900', highlight: stats?.unread > 0 },
    { label: 'Advertisers', value: stats?.advertiser ?? '—', color: 'text-purple-700' },
    { label: 'Collabs',     value: stats?.collab     ?? '—', color: 'text-emerald-700' },
    { label: 'Investors',   value: stats?.investor   ?? '—', color: 'text-blue-700' },
    { label: 'Financial',   value: stats?.financial  ?? '—', color: 'text-yellow-700' },
  ]

  return (
    <div className="flex items-center gap-4 px-6 py-4">
      {cards.map(card => (
        <div key={card.label} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border ${card.highlight ? 'bg-bb-green-light border-bb-green/30' : 'bg-white border-bb-border'}`}>
          <span className={`text-xl font-bold ${card.color}`}>{card.value}</span>
          <span className="text-xs text-gray-500 font-medium">{card.label}</span>
        </div>
      ))}
    </div>
  )
}
