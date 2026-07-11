import { useCallback, useEffect, useMemo, useRef, useState } from "react"

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
import { useTriggerPipeline, usePipelineStream, useRunFindings } from "@/hooks/usePipeline"
import type { PipelineEvent, MarketIntelOutput, CompetitorReconOutput, StrategyOutput } from "@/types/api"

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

const STEP_TO_STAGE: Record<string, number> = {
  market_intelligence: 0,
  competitor_recon: 1,
  strategy_output: 2,
}

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
      marketIntel: null,
      competitorRecon: null,
      strategyOutput: null,
      onQuickInputSubmit: undefined,
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
  tenantId?: string
  businessDescription?: string
  onStateChange?: (nodes: Node[], edges: Edge[]) => void
}

export function AgentPipeline({
  title = "Execution Engine",
  headerLeft,
  tenantId,
  businessDescription,
  onStateChange,
}: AgentPipelineProps) {
  const [stageStates, setStageStates] = useState<StageState[]>(() => stages.map(() => "idle"))
  const [showQuickInput, setShowQuickInput] = useState(false)
  const [judgeBroadcastActive, setJudgeBroadcastActive] = useState(false)
  const [judgeFinalPanelVisible, setJudgeFinalPanelVisible] = useState(false)

  const [currentRunId, setCurrentRunId] = useState<string | null>(null)
  const [marketIntel, setMarketIntel] = useState<MarketIntelOutput | null>(null)
  const [competitorRecon, setCompetitorRecon] = useState<CompetitorReconOutput | null>(null)
  const [strategyOutput, setStrategyOutput] = useState<StrategyOutput | null>(null)
  const [pipelineError, setPipelineError] = useState<string | null>(null)

  const [quickInputBusiness, setQuickInputBusiness] = useState("")
  const [quickInputCompetitors, setQuickInputCompetitors] = useState("")

  const triggerMutation = useTriggerPipeline()
  const { data: findings } = useRunFindings(currentRunId)

  const activeStageIndex = useMemo(() => {
    const processingIndex = stageStates.findIndex((s) => s === "processing")
    if (processingIndex !== -1) return processingIndex
    const idleIndex = stageStates.findIndex((s) => s === "idle")
    return idleIndex === -1 ? stages.length - 1 : idleIndex
  }, [stageStates])

  const completedCount = stageStates.filter((s) => s === "complete").length

  const isSecondAgentResultsVisible = stageStates[1] === "complete"
  const isJudgeActive = stageStates[3] === "processing"

  const handlePipelineEvent = useCallback((event: PipelineEvent) => {
    if (event.type === "step_completed" && event.stepName) {
      const stageIdx = STEP_TO_STAGE[event.stepName]
      if (stageIdx !== undefined) {
        setStageStates((prev) => {
          const next = [...prev]
          next[stageIdx] = "complete"
          if (stageIdx + 1 < stages.length - 1) {
            next[stageIdx + 1] = "processing"
          }
          return next
        })

        const output = event.output as Record<string, unknown> | undefined
        if (output && "error" in (output as Record<string, unknown>)) return

        if (event.stepName === "market_intelligence" && output) {
          setMarketIntel(output as unknown as MarketIntelOutput)
        } else if (event.stepName === "competitor_recon" && output) {
          setCompetitorRecon(output as unknown as CompetitorReconOutput)
        } else if (event.stepName === "strategy_output" && output) {
          setStrategyOutput(output as unknown as StrategyOutput)
        }
      }
    } else if (event.type === "run_completed") {
      setStageStates(["complete", "complete", "complete", "complete"])
    } else if (event.type === "run_failed") {
      setPipelineError(event.error || "Pipeline failed")
      setStageStates((prev) => prev.map((s) => (s === "processing" ? "failed" as unknown as StageState : s)))
    }
  }, [])

  usePipelineStream(currentRunId, handlePipelineEvent)

  const handleLaunch = useCallback(() => {
    setPipelineError(null)
    setMarketIntel(null)
    setCompetitorRecon(null)
    setStrategyOutput(null)
    setJudgeBroadcastActive(false)
    setJudgeFinalPanelVisible(false)
    setShowQuickInput(false)

    const desc = businessDescription || quickInputBusiness
    if (!tenantId || !desc) {
      setQuickInputBusiness(businessDescription || "")
      setShowQuickInput(true)
      return
    }

    const competitors = quickInputCompetitors
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean)

    setStageStates(["processing", "idle", "idle", "idle"])

    triggerMutation.mutate(
      {
        tenantId,
        businessDescription: desc,
        knownCompetitors: competitors.length > 0 ? competitors : undefined,
      },
      {
        onSuccess: (data) => {
          setCurrentRunId(data.runId)
        },
        onError: (err) => {
          setPipelineError(err.message)
          setStageStates(stages.map(() => "idle"))
        },
      },
    )
  }, [tenantId, businessDescription, quickInputBusiness, quickInputCompetitors, triggerMutation])

  const handleQuickInputSubmit = useCallback(() => {
    setShowQuickInput(false)
    const desc = quickInputBusiness.trim() || businessDescription
    if (!desc || !tenantId) return

    setStageStates(["processing", "idle", "idle", "idle"])

    const competitors = quickInputCompetitors
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean)

    triggerMutation.mutate(
      {
        tenantId,
        businessDescription: desc,
        knownCompetitors: competitors.length > 0 ? competitors : undefined,
      },
      {
        onSuccess: (data) => setCurrentRunId(data.runId),
        onError: (err) => {
          setPipelineError(err.message)
          setStageStates(stages.map(() => "idle"))
        },
      },
    )
  }, [quickInputBusiness, quickInputCompetitors, businessDescription, tenantId, triggerMutation])

  const toggleQuickInput = useCallback(() => {
    setShowQuickInput((c) => !c)
  }, [])

  useEffect(() => {
    if (!isJudgeActive) return undefined
    setJudgeBroadcastActive(true)
    setJudgeFinalPanelVisible(false)
    const id = window.setTimeout(() => {
      setJudgeBroadcastActive(false)
      setJudgeFinalPanelVisible(true)
    }, 2600)
    return () => window.clearTimeout(id)
  }, [isJudgeActive])

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
          isSynthesisPromptVisible: false,
          isSynthesisCronActive: false,
          synthesisCronSecondsLeft: 0,
          synthesisPromptValue: "",
          judgeBroadcastActive: index === 3 ? judgeBroadcastActive : false,
          judgeFinalPanelVisible: index === 3 ? judgeFinalPanelVisible : false,
          marketIntel: index === 0 ? marketIntel : null,
          competitorRecon: index === 1 ? competitorRecon : null,
          strategyOutput: index === 2 ? strategyOutput : null,
          pipelineError: index === 0 ? pipelineError : null,
          onToggleQuickInput: index === 0 ? toggleQuickInput : undefined,
          onQuickInputSubmit: index === 0 ? handleQuickInputSubmit : undefined,
          quickInputBusiness: index === 0 ? quickInputBusiness : "",
          quickInputCompetitors: index === 0 ? quickInputCompetitors : "",
          onQuickInputBusinessChange: index === 0 ? setQuickInputBusiness : undefined,
          onQuickInputCompetitorsChange: index === 0 ? setQuickInputCompetitors : undefined,
        },
      }))
    )
  }, [
    stageStates, activeStageIndex, showQuickInput, isSecondAgentResultsVisible,
    judgeBroadcastActive, judgeFinalPanelVisible, marketIntel, competitorRecon,
    strategyOutput, pipelineError, quickInputBusiness, quickInputCompetitors,
    toggleQuickInput, handleQuickInputSubmit,
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
      return mainEdges
    })
  }, [stageStates, activeStageIndex])

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
          <button
            className="launch-button"
            onClick={handleLaunch}
            type="button"
            disabled={triggerMutation.isPending}
          >
            {triggerMutation.isPending ? "Starting..." : launchLabel}
            <ArrowRight className="size-4" />
          </button>
          <div className="profile-chip">
            <div className="profile-initials">AH</div>
          </div>
        </div>
      </header>

      <main className="aether-main">
        {pipelineError ? (
          <div className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
            {pipelineError}
          </div>
        ) : null}
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
