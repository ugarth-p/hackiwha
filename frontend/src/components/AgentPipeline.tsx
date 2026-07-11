import { useCallback, useEffect, useMemo, useState } from "react"

import {
  ReactFlow,
  Background,
  applyNodeChanges,
  applyEdgeChanges,
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
} from "@xyflow/react"
import { ArrowRight } from "lucide-react"

import { AgentNode } from "@/components/AgentNode"

const nodeTypes = { agentNode: AgentNode }

type StageState = "idle" | "processing" | "complete"

type Stage = {
  id: string
  eyebrow: string
  title: string
  detail: string
  statusLabel: string
  icon: "sparkles" | "network" | "workflow" | "circleHelp"
}

export const stages: Stage[] = [
  {
    id: "research",
    eyebrow: "Research Layer",
    title: "Knowledge Crawler",
    detail:
      "Harvests context, source signals, and reference material before execution begins.",
    statusLabel: "IDLE",
    icon: "sparkles",
  },
  {
    id: "logic",
    eyebrow: "Logic Engine",
    title: "Inference Core",
    detail:
      "Evaluates constraints, priorities, and dependencies to shape the next action.",
    statusLabel: "WAITING",
    icon: "network",
  },
  {
    id: "synthesis",
    eyebrow: "Synthesis",
    title: "Execution Matrix",
    detail: "Packages the final output and publishes the completed workflow state.",
    statusLabel: "STANDBY",
    icon: "workflow",
  },
  {
    id: "judge",
    eyebrow: "Judge",
    title: "Verdict Nexus",
    detail: "Broadcasts brand context to evaluators and consolidates the final judgment.",
    statusLabel: "REVIEWING",
    icon: "circleHelp",
  },
]

const executionSteps = [
  { stage: 0, duration: 1900 },
  { stage: 1, duration: 1800 },
  { stage: 2, duration: 1600 },
  { stage: 3, duration: 3200 },
] as const

const VERTICAL_GAP = 380

export function makeDefaultNodes(): Node[] {
  return stages.map((stage, index) => ({
    id: stage.id,
    type: "agentNode",
    position: { x: 0, y: index * VERTICAL_GAP },
    data: {
      eyebrow: stage.eyebrow,
      title: stage.title,
      detail: stage.detail,
      statusLabel: stage.statusLabel,
      icon: stage.icon,
      state: "idle" as StageState,
      isActive: false,
      isCompleted: false,
      isPrimary: index === 0,
      isQuickInputOpen: false,
      isResultPanelVisible: false,
      isSynthesisPromptVisible: false,
      isSynthesisCronActive: false,
      synthesisCronSecondsLeft: 0,
      synthesisPromptValue: "",
      judgeBroadcastActive: false,
      judgeFinalPanelVisible: false,
    },
  }))
}

export function makeDefaultEdges(): Edge[] {
  return [
    { id: "research-logic", source: "research", target: "logic", type: "smoothstep", animated: false },
    { id: "logic-synthesis", source: "logic", target: "synthesis", type: "smoothstep", animated: false },
    { id: "synthesis-judge", source: "synthesis", target: "judge", type: "smoothstep", animated: false },
  ]
}

type JudgePersonaKey = "strategist" | "analyst" | "critic" | "operator" | "mediator"

const judgePersonaOptions: Array<{ value: JudgePersonaKey; label: string }> = [
  { value: "strategist", label: "Strategist" },
  { value: "analyst", label: "Analyst" },
  { value: "critic", label: "Critic" },
  { value: "operator", label: "Operator" },
  { value: "mediator", label: "Mediator" },
]

const judgePersonaDescriptions: Record<JudgePersonaKey, string> = {
  strategist: "Frames the broadest path forward and keeps the brand outcome in focus.",
  analyst: "Breaks the brief into evidence, structure, and measurable constraints.",
  critic: "Pushes on weak spots, hidden assumptions, and execution gaps.",
  operator: "Converts conclusions into a practical delivery plan.",
  mediator: "Balances the strongest points and resolves the disagreements.",
}

function JudgeEvaluatorTrio({ visible }: { visible: boolean }) {
  const [selectedPersonas, setSelectedPersonas] = useState<JudgePersonaKey[]>([
    "strategist", "analyst", "critic",
  ])

  useEffect(() => {
    if (visible) {
      setSelectedPersonas(["strategist", "analyst", "critic"])
    }
  }, [visible])

  if (!visible) return null

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
    <div className="judge-evaluator-trio-wrap">
      <div className="judge-evaluator-trio-connector">
        <span className="judge-evaluator-trio-connector-line" />
      </div>
      <div className="judge-evaluator-trio-grid">
        {evaluators.map((evaluator, index) => (
          <article key={evaluator.name} className="judge-evaluator-mini-card">
            <div className="judge-evaluator-mini-label">Connected Evaluator</div>
            <div className="judge-evaluator-mini-name">{evaluator.name}</div>
            <label className="judge-evaluator-select-wrap">
              <span className="judge-evaluator-select-label">Character</span>
              <select
                className="judge-evaluator-select"
                value={selectedPersonas[index]}
                onChange={(event) => {
                  const nextValue = event.target.value as JudgePersonaKey
                  setSelectedPersonas((vals) =>
                    vals.map((v, i) => (i === index ? nextValue : v))
                  )
                }}
              >
                {judgePersonaOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </label>
            <p className="judge-evaluator-persona-copy">
              {judgePersonaDescriptions[selectedPersonas[index]]}
            </p>
            <p className="judge-evaluator-mini-text">{evaluator.summary}</p>
            <p className="judge-evaluator-mini-text">{evaluator.critique}</p>
            <p className="judge-evaluator-mini-conclusion">{evaluator.conclusion}</p>
          </article>
        ))}
      </div>
    </div>
  )
}

type AgentPipelineProps = {
  title?: string
  headerLeft?: React.ReactNode
  onStateChange?: (nodes: Node[], edges: Edge[]) => void
}

export function AgentPipeline({ title = "Execution Engine", headerLeft, onStateChange }: AgentPipelineProps) {
  const [runId, setRunId] = useState(0)
  const [stageStates, setStageStates] = useState<StageState[]>(() => stages.map(() => "idle"))
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
    const processingIndex = stageStates.findIndex((s) => s === "processing")
    if (processingIndex !== -1) return processingIndex
    const idleIndex = stageStates.findIndex((s) => s === "idle")
    return idleIndex === -1 ? stages.length - 1 : idleIndex
  }, [stageStates])

  const completedCount = stageStates.filter((s) => s === "complete").length

  const toggleQuickInput = useCallback(() => {
    setShowQuickInput((c) => !c)
  }, [])

  const handleSynthesisPromptSubmit = useCallback(() => {
    setShowSynthesisPrompt(false)
    setSynthesisCronActive(true)
    setSynthesisCronSecondsLeft(12)
    setStageStates((s) => s.map((st, i) => (i === 2 ? "complete" : st)))
  }, [])

  const handleLaunch = useCallback(() => {
    setRunId((v) => v + 1)
    setShowQuickInput(false)
    setShowSynthesisPrompt(false)
    setSynthesisPromptValue("")
    setSynthesisCronActive(false)
    setSynthesisCronSecondsLeft(12)
    setJudgeBroadcastActive(false)
    setJudgeFinalPanelVisible(false)
    setStageStates(["processing", "idle", "idle", "idle"])
  }, [])

  const [nodes, setNodes] = useState<Node[]>(makeDefaultNodes)
  const [edges, setEdges] = useState<Edge[]>(makeDefaultEdges)

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => setNodes((nds) => applyNodeChanges(changes, nds)),
    []
  )
  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  )

  useEffect(() => {
    if (runId === 0) return undefined
    const timers: number[] = []

    executionSteps.forEach(({ stage, duration }, index) => {
      const offset = executionSteps.slice(0, index).reduce((t, s) => t + s.duration, 0)

      timers.push(window.setTimeout(() => {
        setStageStates(() => stages.map((_, i) => {
          if (i < stage) return "complete"
          if (i === stage) return "processing"
          return "idle"
        }))
      }, offset))

      if (stage === 2) {
        timers.push(window.setTimeout(() => {
          setShowSynthesisPrompt(true)
          setSynthesisPromptValue("")
        }, offset))
        return
      }

      timers.push(window.setTimeout(() => {
        setStageStates(() => stages.map((_, i) => (i <= stage ? "complete" : "idle")))
      }, offset + duration))
    })

    return () => timers.forEach((id) => window.clearTimeout(id))
  }, [runId])

  useEffect(() => {
    if (!synthesisCronActive) return undefined
    if (synthesisCronSecondsLeft <= 0) {
      setRunId((v) => v + 1)
      setStageStates(["processing", "idle", "idle", "idle"])
      setShowQuickInput(false)
      setSynthesisPromptValue("")
      setSynthesisCronActive(false)
      setSynthesisCronSecondsLeft(12)
      return undefined
    }
    const id = window.setTimeout(() => setSynthesisCronSecondsLeft((v) => v - 1), 1000)
    return () => window.clearTimeout(id)
  }, [synthesisCronActive, synthesisCronSecondsLeft])

  useEffect(() => {
    if (!isJudgeActive) return undefined
    setJudgeBroadcastActive(true)
    setJudgeFinalPanelVisible(false)
    const id = window.setTimeout(() => {
      setJudgeBroadcastActive(false)
      setJudgeFinalPanelVisible(true)
      setStageStates((s) => s.map((st, i) => (i === 3 ? "complete" : st)))
    }, 2600)
    return () => window.clearTimeout(id)
  }, [isJudgeActive])

  useEffect(() => {
    setNodes((currentNodes) =>
      currentNodes.map((node, index) => ({
        ...node,
        data: {
          ...node.data,
          state: stageStates[index],
          isActive: index === activeStageIndex && stageStates[index] === "processing",
          isCompleted: stageStates[index] === "complete",
          isQuickInputOpen: index === 0 ? showQuickInput : false,
          isResultPanelVisible: index === 1 ? isSecondAgentResultsVisible : false,
          isSynthesisPromptVisible: index === 2 ? showSynthesisPrompt : false,
          isSynthesisCronActive: index === 2 ? synthesisCronActive : false,
          synthesisCronSecondsLeft: index === 2 ? synthesisCronSecondsLeft : 0,
          synthesisPromptValue,
          judgeBroadcastActive: index === 3 ? judgeBroadcastActive : false,
          judgeFinalPanelVisible: index === 3 ? judgeFinalPanelVisible : false,
          onToggleQuickInput: index === 0 ? toggleQuickInput : undefined,
          onSynthesisPromptChange: index === 2 ? setSynthesisPromptValue : undefined,
          onSynthesisPromptSubmit: index === 2 ? handleSynthesisPromptSubmit : undefined,
        },
      }))
    )
  }, [
    stageStates, activeStageIndex, showQuickInput, isSecondAgentResultsVisible,
    showSynthesisPrompt, synthesisCronActive, synthesisCronSecondsLeft,
    synthesisPromptValue, judgeBroadcastActive, judgeFinalPanelVisible,
    toggleQuickInput, handleSynthesisPromptSubmit,
  ])

  useEffect(() => {
    setEdges(() => {
      const mainEdges: Edge[] = stages.slice(0, -1).map((stage, index) => {
        const isActive = index === activeStageIndex && stageStates[index] === "processing"
        const isCompleted = stageStates[index] === "complete"
        return {
          id: `${stage.id}-${stages[index + 1].id}`,
          source: stage.id,
          target: stages[index + 1].id,
          type: "smoothstep",
          animated: isActive,
          style: isCompleted || isActive
            ? { stroke: "#ff0071", strokeWidth: 2 }
            : { stroke: "rgba(0,0,0,0.12)", strokeWidth: 1.5 },
        }
      })

      if (synthesisCronActive) {
        mainEdges.push({
          id: "cron-return",
          source: "synthesis",
          target: "research",
          type: "smoothstep",
          animated: true,
          style: { stroke: "#ff0071", strokeWidth: 2 },
          label: "cron",
          labelStyle: { fill: "#ff0071", fontWeight: 700, fontSize: 11 },
          labelBgStyle: { fill: "white", fillOpacity: 0.9 },
        })
      }

      return mainEdges
    })
  }, [stageStates, activeStageIndex, synthesisCronActive])

  useEffect(() => {
    onStateChange?.(nodes, edges)
  }, [nodes, edges, onStateChange])

  const launchLabel = completedCount === stages.length ? "Relaunch Sequence" : "Launch Sequence"

  return (
    <>
      <header className="aether-header">
        <div className="flex items-center gap-8">
          {headerLeft ? <div className="flex items-center gap-3">{headerLeft}</div> : null}
          <div>
            <h1 className="aether-title">{title}</h1>
          </div>
        </div>
        <div className="flex items-center gap-4 sm:gap-6">
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
        <div className="react-flow-container">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.3 }}
            minZoom={0.3}
            maxZoom={1.5}
            nodesDraggable
            nodesConnectable={false}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={20} size={1} color="rgba(0,0,0,0.08)" />
          </ReactFlow>
        </div>
        <JudgeEvaluatorTrio visible={judgeBroadcastActive || judgeFinalPanelVisible} />
      </main>
    </>
  )
}
