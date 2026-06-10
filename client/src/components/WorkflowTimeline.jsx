import { useState } from 'react'
import { CheckIcon, ArrowRightIcon, SparklesIcon } from './Icons'

/**
 * WorkflowTimeline — shared vertical stage timeline
 *
 * Props:
 *   stageNames: string[]          — ordered list of stage names
 *   activeIndex: number           — which stage is current (0-based)
 *   stageData?: {                 — per-stage enrichment (tasks mode)
 *     [index]: { notes: string, completedAt: string|null }
 *   }
 *   onStageClick?: (i) => void    — click any stage (clients/emails: jump to stage)
 *   onAdvance?: () => void        — mark active stage complete, go to next (tasks)
 *   onUpdateNotes?: (i, n) => void — update stage notes (tasks)
 *   onAIAssess?: () => void       — AI suggest stage button (emails)
 *   aiAssessing?: boolean
 *   readOnly?: boolean
 */
export default function WorkflowTimeline({
  stageNames = [],
  activeIndex = 0,
  stageData = {},
  onStageClick,
  onAdvance,
  onUpdateNotes,
  onAIAssess,
  aiAssessing = false,
  readOnly = false,
}) {
  const [editingNotes, setEditingNotes] = useState(null)
  const [notesValue, setNotesValue] = useState('')
  const isComplete = activeIndex >= stageNames.length

  function openNotes(index) {
    setEditingNotes(index)
    setNotesValue(stageData[index]?.notes || '')
  }

  function saveNotes(index) {
    onUpdateNotes?.(index, notesValue)
    setEditingNotes(null)
  }

  return (
    <div className="space-y-0">
      {/* AI assess button (emails only) */}
      {onAIAssess && !readOnly && (
        <div className="mb-4">
          <button
            onClick={onAIAssess}
            disabled={aiAssessing}
            className="flex items-center gap-2 text-sm font-medium text-bb-green border border-bb-green/30 bg-bb-green-light rounded-lg px-3 py-2 hover:bg-bb-green/10 transition-colors disabled:opacity-50"
          >
            <SparklesIcon className="w-4 h-4" />
            {aiAssessing ? 'Assessing...' : 'Ask AI to assess stage'}
          </button>
        </div>
      )}

      {isComplete && (
        <div className="mb-4 flex items-center gap-2 px-4 py-2.5 bg-emerald-50 border border-emerald-200 rounded-lg">
          <CheckIcon className="w-4 h-4 text-emerald-600" />
          <span className="text-sm font-medium text-emerald-700">All stages complete</span>
        </div>
      )}

      <div className="relative">
        {/* Vertical connecting line */}
        <div className="absolute left-[19px] top-5 bottom-5 w-px bg-gray-200" />

        <div className="space-y-0">
          {stageNames.map((name, i) => {
            const completed = i < activeIndex
            const active = i === activeIndex && !isComplete
            const future = i > activeIndex
            const data = stageData[i] || {}

            return (
              <div key={i} className="relative">
                <div
                  className={`flex gap-4 py-3 px-1 rounded-xl transition-colors ${
                    active ? 'bg-bb-green-light' : ''
                  } ${onStageClick && !readOnly ? 'cursor-pointer hover:bg-gray-50' : ''} ${
                    active && onStageClick ? 'hover:bg-bb-green-light' : ''
                  }`}
                  onClick={() => !readOnly && onStageClick?.(i)}
                >
                  {/* Stage node */}
                  <div className="relative z-10 shrink-0 mt-0.5">
                    {completed ? (
                      <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center shadow-sm">
                        <CheckIcon className="w-5 h-5 text-white" />
                      </div>
                    ) : active ? (
                      <div className="w-10 h-10 rounded-full bg-bb-green flex items-center justify-center shadow-sm ring-4 ring-bb-green/20">
                        <ArrowRightIcon className="w-4 h-4 text-white" />
                      </div>
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-white border-2 border-gray-200 flex items-center justify-center">
                        <span className="text-xs font-semibold text-gray-400">{i + 1}</span>
                      </div>
                    )}
                  </div>

                  {/* Stage content */}
                  <div className="flex-1 min-w-0 pt-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className={`text-sm font-semibold ${
                          completed ? 'text-emerald-700' : active ? 'text-bb-green' : 'text-gray-400'
                        }`}>
                          {name}
                        </span>
                        {completed && data.completedAt && (
                          <p className="text-xs text-emerald-600 mt-0.5">
                            Completed {new Date(data.completedAt).toLocaleDateString('en-AU', {
                              day: 'numeric', month: 'short', year: 'numeric'
                            })}
                          </p>
                        )}
                        {active && (
                          <p className="text-xs font-medium text-bb-green mt-0.5 uppercase tracking-wide">
                            Active stage
                          </p>
                        )}
                      </div>
                      {/* Stage number badge for non-active */}
                      {!active && (
                        <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${
                          completed
                            ? 'bg-emerald-100 text-emerald-600'
                            : 'bg-gray-100 text-gray-400'
                        }`}>
                          {i + 1}
                        </span>
                      )}
                    </div>

                    {/* Action needed / notes for active stage */}
                    {active && !readOnly && (
                      <div className="mt-3 space-y-2" onClick={e => e.stopPropagation()}>
                        {editingNotes === i ? (
                          <div className="space-y-2">
                            <textarea
                              autoFocus
                              value={notesValue}
                              onChange={e => setNotesValue(e.target.value)}
                              placeholder="What action is needed at this stage?"
                              rows={3}
                              className="w-full input text-sm resize-none"
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => saveNotes(i)}
                                className="btn-primary text-xs px-3 py-1.5"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => setEditingNotes(null)}
                                className="btn-secondary text-xs px-3 py-1.5"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div>
                            {data.notes ? (
                              <div
                                onClick={() => onUpdateNotes && openNotes(i)}
                                className={`text-sm text-gray-700 bg-white border border-bb-border rounded-lg px-3 py-2 ${onUpdateNotes ? 'cursor-text hover:border-bb-green' : ''}`}
                              >
                                <span className="text-xs font-semibold text-bb-green uppercase tracking-wide block mb-1">
                                  Action needed
                                </span>
                                {data.notes}
                              </div>
                            ) : onUpdateNotes ? (
                              <button
                                onClick={() => openNotes(i)}
                                className="text-xs text-gray-400 hover:text-bb-green transition-colors"
                              >
                                + Add action note for this stage
                              </button>
                            ) : null}
                          </div>
                        )}

                        {/* Completed notes for done stages */}
                        {onUpdateNotes && (
                          <button
                            onClick={onAdvance}
                            className="flex items-center gap-2 btn-primary text-sm py-2"
                          >
                            <CheckIcon className="w-4 h-4" />
                            Mark Stage Complete
                          </button>
                        )}
                      </div>
                    )}

                    {/* Completed stage notes (read-only display) */}
                    {completed && data.notes && (
                      <p className="text-xs text-gray-500 mt-1">{data.notes}</p>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
