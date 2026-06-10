export default function StatsCards({ stats }) {
  const cards = [
    { label: 'Total emails', value: stats?.total ?? '—', icon: '📧' },
    { label: 'Unread', value: stats?.unread ?? '—', icon: '🔵', accent: stats?.unread > 0 },
    { label: 'Collab', value: stats?.collab ?? '—', icon: '🤝' },
    { label: 'Commercial', value: stats?.commercial ?? '—', icon: '💼' },
  ]

  return (
    <div className="grid grid-cols-4 gap-4 p-6 pb-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className={`rounded-xl border p-4 ${
            card.accent
              ? 'bg-bb-light border-bb-border'
              : 'bg-white border-gray-200'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              {card.label}
            </span>
            <span className="text-base">{card.icon}</span>
          </div>
          <div className={`text-2xl font-bold ${card.accent ? 'text-bb-green' : 'text-gray-900'}`}>
            {card.value}
          </div>
        </div>
      ))}
    </div>
  )
}
