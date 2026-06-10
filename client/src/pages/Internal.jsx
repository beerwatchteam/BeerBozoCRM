import { useState } from 'react'
import InternalChat from '../components/InternalChat'

const PERSONAS = [
  {
    id: 'alex',
    name: 'Alex',
    title: 'CEO',
    emoji: '🎯',
    description: 'Strategy, fundraising, growth, and high-level decisions.',
  },
  {
    id: 'mia',
    name: 'Mia',
    title: 'Head of Marketing',
    emoji: '📣',
    description: 'Social media, content, influencer collabs, and user acquisition.',
  },
  {
    id: 'sam',
    name: 'Sam',
    title: 'Head of Design',
    emoji: '🎨',
    description: 'UI/UX, brand identity, and visual design for BeerBozo.',
  },
  {
    id: 'jordan',
    name: 'Jordan',
    title: 'Head of Commercial',
    emoji: '💼',
    description: 'Advertiser partnerships, pub onboarding, revenue, and investors.',
  },
]

export default function Internal() {
  const [activePersona, setActivePersona] = useState(PERSONAS[0])

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <div className="w-56 shrink-0 border-r border-bb-border bg-white flex flex-col">
        <div className="px-4 py-4 border-b border-bb-border">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Team</h2>
        </div>
        <nav className="flex-1 p-2 space-y-0.5">
          {PERSONAS.map((persona) => (
            <button
              key={persona.id}
              onClick={() => setActivePersona(persona)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                activePersona.id === persona.id
                  ? 'bg-bb-light border border-bb-border'
                  : 'hover:bg-gray-50'
              }`}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                activePersona.id === persona.id
                  ? 'bg-bb-green text-white'
                  : 'bg-gray-100 text-gray-600'
              }`}>
                {persona.name[0]}
              </div>
              <div>
                <div className={`text-sm font-medium ${
                  activePersona.id === persona.id ? 'text-bb-green' : 'text-gray-800'
                }`}>
                  {persona.name}
                </div>
                <div className="text-xs text-gray-400">{persona.title}</div>
              </div>
            </button>
          ))}
        </nav>
      </div>

      {/* Chat panel */}
      <div className="flex-1 overflow-hidden">
        <InternalChat key={activePersona.id} persona={activePersona} />
      </div>
    </div>
  )
}
