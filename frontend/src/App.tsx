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
]

const executionSteps = [
  { stage: 0, duration: 1900 },
  { stage: 1, duration: 1800 },
  { stage: 2, duration: 1600 },
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
  onPrimaryClick,
}: {
  stage: Stage
  index: number
  state: StageState
  isActive: boolean
  isCompleted: boolean
  isPrimary?: boolean
  isQuickInputOpen?: boolean
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
      className={`workflow-node ${isPrimary ? "workflow-node-primary" : ""} ${isActive ? "workflow-node-active" : ""} ${isCompleted ? "workflow-node-complete" : ""}`}
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
          <div className="quick-input-row">
            <input
              className="quick-input-field"
              defaultValue="Neural Ingress"
              placeholder="Enter agent context"
            />
            <button className="quick-input-action" type="button">
              Start
            </button>
          </div>
        </motion.div>
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

  const handleLaunch = () => {
    setRunId((value) => value + 1)
    setShowQuickInput(false)
    setStageStates(["processing", "idle", "idle"])
  }

  const toggleQuickInput = () => {
    setShowQuickInput((current) => !current)
  }

  const launchLabel =
    completedCount === stages.length ? "Relaunch Sequence" : "Launch Sequence"

  return (
    <div className="min-h-screen overflow-hidden bg-white text-black">
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
                    />

                    {index < stages.length - 1 ? (
                      <Connector active={isActive} completed={isCompleted} />
                    ) : null}
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
