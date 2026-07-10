import { useEffect, useMemo, useState } from "react"

import {
  ArrowRight,
  Bot,
  CircleHelp,
  FolderOpen,
  LibraryBig,
  Network,
  Settings2,
  Sparkles,
  Workflow,
} from "lucide-react"
import { motion } from "framer-motion"

type StageState = "idle" | "processing" | "complete"

type Stage = {
  id: string
  eyebrow: string
  title: string
  detail: string
  statusLabel: string
  icon: typeof Bot
}

const stages: Stage[] = [
  {
    id: "research",
    eyebrow: "Research Layer",
    title: "Knowledge Crawler",
    detail:
      "Harvests context, source signals, and reference material before execution begins.",
    statusLabel: "IDLE",
    icon: Sparkles,
  },
  {
    id: "logic",
    eyebrow: "Logic Engine",
    title: "Inference Core",
    detail:
      "Evaluates constraints, priorities, and dependencies to shape the next action.",
    statusLabel: "WAITING",
    icon: Network,
  },
  {
    id: "synthesis",
    eyebrow: "Synthesis",
    title: "Execution Matrix",
    detail: "Packages the final output and publishes the completed workflow state.",
    statusLabel: "STANDBY",
    icon: Workflow,
  },
  {
    id: "judge",
    eyebrow: "Judge",
    title: "Verdict Nexus",
    detail: "Broadcasts brand context to evaluators and consolidates the final judgment.",
    statusLabel: "REVIEWING",
    icon: CircleHelp,
  },
]

const executionSteps = [
  { stage: 0, duration: 1900 },
  { stage: 1, duration: 1800 },
  { stage: 2, duration: 1600 },
  { stage: 3, duration: 3200 },
] as const

function StageIcon({ icon: Icon }: { icon: Stage["icon"] }) {
  return (
    <div className="aether-icon-wrap">
      <Icon className="size-6" strokeWidth={1.9} />
    </div>
  )
}

function WorkflowNode({
  stage,
  index,
  state,
  isActive,
  isCompleted,
  isPrimary = false,
  isQuickInputOpen = false,
  isResultPanelVisible = false,
  isSynthesisPromptVisible = false,
  isSynthesisCronActive = false,
  synthesisCronSecondsLeft = 0,
  synthesisPromptValue = "",
  judgeBroadcastActive = false,
  judgeFinalPanelVisible = false,
  onSynthesisPromptChange,
  onSynthesisPromptSubmit,
  onPrimaryClick,
}: {
  stage: Stage
  index: number
  state: StageState
  isActive: boolean
  isCompleted: boolean
  isPrimary?: boolean
  isQuickInputOpen?: boolean
  isResultPanelVisible?: boolean
  isSynthesisPromptVisible?: boolean
  isSynthesisCronActive?: boolean
  synthesisCronSecondsLeft?: number
  synthesisPromptValue?: string
  judgeBroadcastActive?: boolean
  judgeFinalPanelVisible?: boolean
  onSynthesisPromptChange?: (value: string) => void
  onSynthesisPromptSubmit?: () => void
  onPrimaryClick?: () => void
}) {
  const statusText =
    state === "processing" && isActive
      ? "PROCESSING..."
      : isCompleted
        ? "COMPLETE"
        : stage.statusLabel

  const card = (
    <>
      <div className={`workflow-port ${isActive || isCompleted ? "workflow-port-active" : ""}`} />
      <div className={`workflow-card ${isPrimary ? "workflow-card-primary" : ""}`}>
        <div className="workflow-scan" />
        {stage.id === "judge" ? <div className="workflow-card-judge-glow" /> : null}
        <div className="flex flex-col items-center gap-5 text-center">
          <span className="workflow-eyebrow">{stage.eyebrow}</span>
          <StageIcon icon={stage.icon} />
          <h2 className="workflow-title">{stage.title}</h2>
          <p className="workflow-detail">{stage.detail}</p>
          <div className="workflow-status">
            STATUS: <span>{statusText}</span>
          </div>
        </div>

        <div className="workflow-meter">
          <span
            className={`workflow-meter-fill ${isCompleted ? "workflow-meter-fill-complete" : isActive ? "workflow-meter-fill-active" : "workflow-meter-fill-idle"}`}
          />
        </div>
      </div>
    </>
  )

  return (
    <motion.section
      layout
      initial={{ opacity: 0, y: 24, scale: 0.98 }}
      animate={{
        opacity: 1,
        y: 0,
        scale: isActive ? 1.015 : 1,
      }}
      transition={{ duration: 0.45, delay: index * 0.08 }}
      className={`workflow-node ${stage.id === "judge" ? "workflow-node-judge" : ""} ${isPrimary ? "workflow-node-primary" : ""} ${isActive ? "workflow-node-active" : ""} ${isCompleted ? "workflow-node-complete" : ""}`}
    >
      {isPrimary ? (
        <button
          className="workflow-node-hitbox workflow-node-hitbox-primary"
          onClick={onPrimaryClick}
          type="button"
          aria-expanded={isQuickInputOpen}
          aria-label={`Open quick input for ${stage.title}`}
        >
          {card}
        </button>
      ) : (
        <div className="workflow-node-frame">{card}</div>
      )}

      {isPrimary && isQuickInputOpen ? (
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.2 }}
          className="quick-input-panel"
        >
          <div className="quick-input-label">Quick Agent Input</div>
          <div className="quick-input-stack">
            <input
              className="quick-input-field"
              defaultValue="Neural Ingress"
              placeholder="Enter agent context"
            />
            <input
              className="quick-input-field"
              placeholder="Advertiser names, comma separated"
            />
            <div className="quick-input-row">
              <span className="quick-input-hint">Add advertiser names to scope the agent run.</span>
              <button className="quick-input-action" type="button">
                Start
              </button>
            </div>
          </div>
        </motion.div>
      ) : null}

      {stage.id === "logic" && isResultPanelVisible ? (
        <motion.aside
          initial={{ opacity: 0, x: 10, scale: 0.98 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          transition={{ duration: 0.24, ease: "easeOut" }}
          className="agent-results-panel"
        >
          <div className="agent-results-label">Second Agent Results</div>
          <div className="agent-results-title">Constraints resolved</div>
          <p className="agent-results-copy">
            The logic engine has finished evaluating the incoming brief. Key priorities,
            dependencies, and execution order are now locked in.
          </p>

          <div className="agent-results-list">
            <div className="agent-results-item">
              <span className="agent-results-key">Priority</span>
              <span className="agent-results-value">High-confidence routing</span>
            </div>
            <div className="agent-results-item">
              <span className="agent-results-key">Scope</span>
              <span className="agent-results-value">Advertiser set normalized</span>
            </div>
            <div className="agent-results-item">
              <span className="agent-results-key">Status</span>
              <span className="agent-results-value">Ready for synthesis</span>
            </div>
          </div>
        </motion.aside>
      ) : null}

      {stage.id === "synthesis" && (isSynthesisPromptVisible || isSynthesisCronActive) ? (
        <motion.aside
          initial={{ opacity: 0, x: -10, scale: 0.98 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          transition={{ duration: 0.24, ease: "easeOut" }}
          className="synthesis-prompt-panel"
        >
          {isSynthesisCronActive ? (
            <>
              <div className="synthesis-prompt-label">Third Agent Cron</div>
              <div className="synthesis-prompt-title">Restarting the first agent</div>
              <p className="synthesis-prompt-copy">
                The cycle is running. When the timer ends, the first agent will restart automatically.
              </p>

              <div className="synthesis-cron-timer">
                <div className="synthesis-cron-value">{String(synthesisCronSecondsLeft).padStart(2, "0")}</div>
                <div className="synthesis-cron-caption">seconds remaining</div>
              </div>
            </>
          ) : (
            <>
              <div className="synthesis-prompt-label">Third Agent Check-In</div>
              <div className="synthesis-prompt-title">Validate the plan or add a change</div>
              <p className="synthesis-prompt-copy">
                Confirm the plan, or type what you want implemented next. The workflow
                continues as soon as you press OK.
              </p>

              <div className="synthesis-prompt-stack">
                <input
                  className="synthesis-prompt-field"
                  value={synthesisPromptValue}
                  onChange={(event) => onSynthesisPromptChange?.(event.target.value)}
                  placeholder="Validate the plan or describe an implementation"
                />
                <div className="synthesis-prompt-row">
                  <span className="synthesis-prompt-hint">
                    The synthesis agent will continue after your confirmation.
                  </span>
                  <button className="synthesis-prompt-action" type="button" onClick={onSynthesisPromptSubmit}>
                    OK
                  </button>
                </div>
              </div>
            </>
          )}
        </motion.aside>
      ) : null}

      {stage.id === "judge" && judgeBroadcastActive ? (
        <motion.aside
          initial={{ opacity: 0, x: 10, scale: 0.98 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          transition={{ duration: 0.24, ease: "easeOut" }}
          className="judge-evaluators-panel"
        >
          <div className="judge-panel-label">Judge Broadcast</div>
          <div className="judge-panel-title">Brand context sent to 3 evaluators</div>
          <p className="judge-panel-copy">
            Each evaluator reviews the brief, lists pros and cons, critiques the other views,
            and returns a refined conclusion to the Judge.
          </p>

          <div className="judge-evaluators-grid">
            <div className="judge-evaluator-card">
              <span className="judge-evaluator-name">Evaluator Alpha</span>
              <span className="judge-evaluator-note">Pros: clear brand fit and strong intent.</span>
              <span className="judge-evaluator-note">Cons: proof points need tightening.</span>
              <span className="judge-evaluator-note">Critique: Beta underweights message clarity.</span>
              <span className="judge-evaluator-note">Refined conclusion: proceed with guardrails.</span>
            </div>
            <div className="judge-evaluator-card">
              <span className="judge-evaluator-name">Evaluator Beta</span>
              <span className="judge-evaluator-note">Pros: positioning is differentiated.</span>
              <span className="judge-evaluator-note">Cons: execution risk is still visible.</span>
              <span className="judge-evaluator-note">Critique: Gamma is too conservative on timing.</span>
              <span className="judge-evaluator-note">Refined conclusion: keep the concept, sharpen delivery.</span>
            </div>
            <div className="judge-evaluator-card">
              <span className="judge-evaluator-name">Evaluator Gamma</span>
              <span className="judge-evaluator-note">Pros: high confidence in the core strategy.</span>
              <span className="judge-evaluator-note">Cons: rollout should be more disciplined.</span>
              <span className="judge-evaluator-note">Critique: Alpha is slightly over-optimistic.</span>
              <span className="judge-evaluator-note">Refined conclusion: approve after minor revisions.</span>
            </div>
          </div>
        </motion.aside>
      ) : null}

      {stage.id === "judge" && judgeFinalPanelVisible ? (
        <motion.aside
          initial={{ opacity: 0, x: -10, scale: 0.98 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          transition={{ duration: 0.24, ease: "easeOut" }}
          className="judge-final-panel"
        >
          <div className="judge-panel-label judge-panel-label-final">Final Judgment Panel</div>
          <div className="judge-panel-title">Verdict delivered</div>
          <div className="judge-verdict">Overall verdict: proceed with implementation</div>

          <div className="judge-summary-list">
            <div className="judge-summary-item">
              <span className="judge-summary-key">Strengths</span>
              <span className="judge-summary-value">Strong brand fit, differentiated positioning, and aligned messaging</span>
            </div>
            <div className="judge-summary-item">
              <span className="judge-summary-key">Weaknesses</span>
              <span className="judge-summary-value">Needs tighter proof points and more disciplined rollout timing</span>
            </div>
            <div className="judge-summary-item">
              <span className="judge-summary-key">Consensus</span>
              <span className="judge-summary-value">All three evaluators support the core strategy and direction</span>
            </div>
            <div className="judge-summary-item">
              <span className="judge-summary-key">Disagreements</span>
              <span className="judge-summary-value">They disagree on how much execution risk remains before launch</span>
            </div>
            <div className="judge-summary-item">
              <span className="judge-summary-key">Recommendations</span>
              <span className="judge-summary-value">Tighten copy, validate claims, refine the rollout, then ship</span>
            </div>
          </div>
        </motion.aside>
      ) : null}

      <div className={`workflow-port mt-1 ${isActive || isCompleted ? "workflow-port-active" : ""}`} />
    </motion.section>
  )
}

function Connector({ active, completed }: { active: boolean; completed: boolean }) {
  return (
    <div className="connector-slot">
      <div className={`connector-line ${active || completed ? "connector-line-active" : ""}`} />
      <div
        className={`connector-pulse ${active ? "connector-pulse-active" : ""} ${completed ? "connector-pulse-complete" : ""}`}
      />
    </div>
  )
}

function CronReturnConnector({ active }: { active: boolean }) {
  return (
    <div className={`cron-return-connector ${active ? "cron-return-connector-active" : ""}`}>
      <div className="cron-return-connector-line" />
      <div className="cron-return-connector-pulse" />
    </div>
  )
}

function JudgeEvaluatorTrio({ visible }: { visible: boolean }) {
  if (!visible) {
    return null
  }

  const evaluators = [
    {
      name: "Evaluator Alpha",
      summary: "Pros: strong brand fit. Cons: proof points need tightening.",
      critique: "Critiques Beta for underplaying clarity.",
      conclusion: "Refined conclusion: proceed with guardrails.",
    },
    {
      name: "Evaluator Beta",
      summary: "Pros: differentiated positioning. Cons: execution risk remains.",
      critique: "Critiques Gamma for being too conservative on timing.",
      conclusion: "Refined conclusion: keep the concept, sharpen delivery.",
    },
    {
      name: "Evaluator Gamma",
      summary: "Pros: high strategic confidence. Cons: rollout needs discipline.",
      critique: "Critiques Alpha for being slightly over-optimistic.",
      conclusion: "Refined conclusion: approve after minor revisions.",
    },
  ]

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, staggerChildren: 0.06 }}
      className="judge-evaluator-trio-wrap"
    >
      <div className="judge-evaluator-trio-connector">
        <span className="judge-evaluator-trio-connector-line" />
      </div>

      <div className="judge-evaluator-trio-grid">
        {evaluators.map((evaluator, index) => (
          <motion.article
            key={evaluator.name}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24, delay: index * 0.06 }}
            className="judge-evaluator-mini-card"
          >
            <div className="judge-evaluator-mini-label">Connected Evaluator</div>
            <div className="judge-evaluator-mini-name">{evaluator.name}</div>
            <p className="judge-evaluator-mini-text">{evaluator.summary}</p>
            <p className="judge-evaluator-mini-text">{evaluator.critique}</p>
            <p className="judge-evaluator-mini-conclusion">{evaluator.conclusion}</p>
          </motion.article>
        ))}
      </div>
    </motion.div>
  )
}

function SideNavItem({
  icon: Icon,
  label,
  active = false,
}: {
  icon: typeof FolderOpen
  label: string
  active?: boolean
}) {
  return (
    <a
      href="#"
      className={`side-nav-item ${active ? "side-nav-item-active" : ""}`}
      onClick={(event) => event.preventDefault()}
    >
      <Icon className="size-4" strokeWidth={1.8} />
      <span>{label}</span>
    </a>
  )
}

export function App() {
  const [runId, setRunId] = useState(0)
  const [stageStates, setStageStates] = useState<StageState[]>(() =>
    stages.map(() => "idle")
  )
  const [showQuickInput, setShowQuickInput] = useState(false)
  const [synthesisPromptValue, setSynthesisPromptValue] = useState("")
  const [showSynthesisPrompt, setShowSynthesisPrompt] = useState(false)
  const [synthesisCronActive, setSynthesisCronActive] = useState(false)
  const [synthesisCronSecondsLeft, setSynthesisCronSecondsLeft] = useState(12)
  const [judgeBroadcastActive, setJudgeBroadcastActive] = useState(false)
  const [judgeFinalPanelVisible, setJudgeFinalPanelVisible] = useState(false)
  const isSecondAgentResultsVisible = stageStates[1] === "complete"
  const isJudgeActive = stageStates[3] === "processing"

  const activeStageIndex = useMemo(() => {
    const processingIndex = stageStates.findIndex((state) => state === "processing")
    if (processingIndex !== -1) {
      return processingIndex
    }

    const idleIndex = stageStates.findIndex((state) => state === "idle")
    return idleIndex === -1 ? stages.length - 1 : idleIndex
  }, [stageStates])

  const completedCount = stageStates.filter((state) => state === "complete").length

  useEffect(() => {
    if (runId === 0) {
      return undefined
    }

    const timers: number[] = []

    executionSteps.forEach(({ stage, duration }, index) => {
      const offset = executionSteps
        .slice(0, index)
        .reduce((total, step) => total + step.duration, 0)

      timers.push(
        window.setTimeout(() => {
          setStageStates(() =>
            stages.map((_, currentIndex) => {
              if (currentIndex < stage) {
                return "complete"
              }

              if (currentIndex === stage) {
                return "processing"
              }

              return "idle"
            })
          )
        }, offset)
      )

      if (stage === 2) {
        timers.push(
          window.setTimeout(() => {
            setShowSynthesisPrompt(true)
            setSynthesisPromptValue("")
          }, offset)
        )

        return
      }

      timers.push(
        window.setTimeout(() => {
          setStageStates(() =>
            stages.map((_, currentIndex) => {
              if (currentIndex <= stage) {
                return "complete"
              }

              return "idle"
            })
          )
        }, offset + duration)
      )
    })

    return () => {
      timers.forEach((timerId) => window.clearTimeout(timerId))
    }
  }, [runId])

  useEffect(() => {
    if (!synthesisCronActive) {
      return undefined
    }

    if (synthesisCronSecondsLeft <= 0) {
      setRunId((value) => value + 1)
      setStageStates(["processing", "idle", "idle"])
      setShowQuickInput(false)
      setSynthesisPromptValue("")
      setSynthesisCronSecondsLeft(12)
      return undefined
    }

    const timerId = window.setTimeout(() => {
      setSynthesisCronSecondsLeft((currentValue) => currentValue - 1)
    }, 1000)

    return () => window.clearTimeout(timerId)
  }, [synthesisCronActive, synthesisCronSecondsLeft])

  const handleLaunch = () => {
    setRunId((value) => value + 1)
    setShowQuickInput(false)
    setShowSynthesisPrompt(false)
    setSynthesisPromptValue("")
    setSynthesisCronActive(false)
    setSynthesisCronSecondsLeft(12)
    setJudgeBroadcastActive(false)
    setJudgeFinalPanelVisible(false)
    setStageStates(["processing", "idle", "idle"])
  }

  const toggleQuickInput = () => {
    setShowQuickInput((current) => !current)
  }

  const handleSynthesisPromptSubmit = () => {
    setShowSynthesisPrompt(false)
    setSynthesisCronActive(true)
    setSynthesisCronSecondsLeft(12)
    setStageStates((currentStages) =>
      currentStages.map((state, index) => (index === 2 ? "complete" : state))
    )
  }

  useEffect(() => {
    if (!isJudgeActive) {
      return undefined
    }

    setJudgeBroadcastActive(true)
    setJudgeFinalPanelVisible(false)

    const timerId = window.setTimeout(() => {
      setJudgeBroadcastActive(false)
      setJudgeFinalPanelVisible(true)
      setStageStates((currentStages) =>
        currentStages.map((state, index) => (index === 3 ? "complete" : state))
      )
    }, 2600)

    return () => window.clearTimeout(timerId)
  }, [isJudgeActive])

  const launchLabel =
    completedCount === stages.length ? "Relaunch Sequence" : "Launch Sequence"

  return (
    <div className="min-h-screen overflow-x-hidden bg-white text-black">
      <div className="aether-backdrop" />

      <aside className="aether-sidebar">
        <div className="px-6 pt-6">
          <div className="space-y-1">
            <p className="aether-brand">Aether</p>
            <p className="aether-brand-sub">Intelligence Flow</p>
          </div>
        </div>

        <nav className="mt-10 flex flex-1 flex-col gap-1 px-1">
          <SideNavItem icon={FolderOpen} label="Projects" />
          <SideNavItem icon={LibraryBig} label="Library" />
          <SideNavItem icon={Bot} label="Agents" active />
          <SideNavItem icon={Workflow} label="Workflows" />
        </nav>

        <div className="px-4 pb-6">
          <button className="sidebar-cta" onClick={handleLaunch} type="button">
            New Pipeline
          </button>

          <div className="mt-6 space-y-1 border-t border-[rgba(0,0,0,0.08)] pt-6">
            <a className="side-footer-item" href="#" onClick={(event) => event.preventDefault()}>
              <Settings2 className="size-4" strokeWidth={1.8} />
              <span>Settings</span>
            </a>
            <a className="side-footer-item" href="#" onClick={(event) => event.preventDefault()}>
              <CircleHelp className="size-4" strokeWidth={1.8} />
              <span>Support</span>
            </a>
          </div>
        </div>
      </aside>

      <div className="min-h-screen pl-60">
        <header className="aether-header">
          <div className="flex items-center gap-8">
            <div>
              <h1 className="aether-title">Execution Engine</h1>
            </div>

            <nav className="hidden items-center gap-8 md:flex">
              <a className="aether-tab" href="#" onClick={(event) => event.preventDefault()}>
                Live Flow
              </a>
              <a className="aether-tab aether-tab-active" href="#" onClick={(event) => event.preventDefault()}>
                Architecture
              </a>
              <a className="aether-tab" href="#" onClick={(event) => event.preventDefault()}>
                Metrics
              </a>
            </nav>
          </div>

          <div className="flex items-center gap-4 sm:gap-6">
            <div className="text-right leading-tight">
              <div className="aether-metric">LATENCY: 12ms</div>
              <div className="aether-metric-primary">Optimized</div>
            </div>

            <button className="launch-button" onClick={handleLaunch} type="button">
              {launchLabel}
              <ArrowRight className="size-4" />
            </button>

            <div className="profile-chip">
              <div className="profile-initials">AH</div>
            </div>
          </div>
        </header>

        <main className="aether-main">
          <div className="aether-workspace">
            {synthesisCronActive ? <CronReturnConnector active /> : null}
            <div className="aether-flow-column">
              {stages.map((stage, index) => {
                const isActive =
                  index === activeStageIndex && stageStates[index] === "processing"
                const isCompleted = stageStates[index] === "complete"

                return (
                  <motion.div key={stage.id} className="contents" layout>
                    <WorkflowNode
                      index={index}
                      stage={stage}
                      state={stageStates[index]}
                      isActive={isActive}
                      isCompleted={isCompleted}
                      isPrimary={index === 0}
                      onPrimaryClick={index === 0 ? toggleQuickInput : undefined}
                      isQuickInputOpen={index === 0 ? showQuickInput : false}
                      isResultPanelVisible={index === 1 ? isSecondAgentResultsVisible : false}
                      isSynthesisPromptVisible={index === 2 ? showSynthesisPrompt : false}
                      isSynthesisCronActive={index === 2 ? synthesisCronActive : false}
                      synthesisCronSecondsLeft={index === 2 ? synthesisCronSecondsLeft : 0}
                      synthesisPromptValue={synthesisPromptValue}
                      onSynthesisPromptChange={setSynthesisPromptValue}
                      onSynthesisPromptSubmit={handleSynthesisPromptSubmit}
                      judgeBroadcastActive={index === 3 ? judgeBroadcastActive : false}
                      judgeFinalPanelVisible={index === 3 ? judgeFinalPanelVisible : false}
                    />

                    {index < stages.length - 1 ? (
                      <Connector active={isActive} completed={isCompleted} />
                    ) : null}

                    {index === 3 ? <JudgeEvaluatorTrio visible={judgeBroadcastActive || judgeFinalPanelVisible} /> : null}
                  </motion.div>
                )
              })}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

export default App
