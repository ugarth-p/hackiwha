import { Handle, Position, type NodeProps } from "@xyflow/react"
import { motion } from "framer-motion"
import {
  CircleHelp,
  Network,
  Sparkles,
  Workflow,
} from "lucide-react"
import type { MarketIntelOutput, CompetitorReconOutput, StrategyOutput } from "@/types/api"

type StageState = "idle" | "processing" | "complete"

type StageData = {
  eyebrow: string
  title: string
  detail: string
  statusLabel: string
  icon: "sparkles" | "network" | "workflow" | "circleHelp"
  state: StageState
  isActive: boolean
  isCompleted: boolean
  isPrimary: boolean
  isQuickInputOpen: boolean
  isResultPanelVisible: boolean
  isSynthesisPromptVisible: boolean
  isSynthesisCronActive: boolean
  synthesisCronSecondsLeft: number
  synthesisPromptValue: string
  judgeBroadcastActive: boolean
  judgeFinalPanelVisible: boolean
  marketIntel: MarketIntelOutput | null
  competitorRecon: CompetitorReconOutput | null
  strategyOutput: StrategyOutput | null
  pipelineError: string | null
  onToggleQuickInput?: () => void
  onQuickInputSubmit?: () => void
  quickInputBusiness?: string
  quickInputCompetitors?: string
  onQuickInputBusinessChange?: (value: string) => void
  onQuickInputCompetitorsChange?: (value: string) => void
  onSynthesisPromptChange?: (value: string) => void
  onSynthesisPromptSubmit?: () => void
}

const iconMap = {
  sparkles: Sparkles,
  network: Network,
  workflow: Workflow,
  circleHelp: CircleHelp,
} as const

function StageIcon({ icon }: { icon: StageData["icon"] }) {
  const Icon = iconMap[icon]
  return (
    <div className="aether-icon-wrap">
      <Icon className="size-6" strokeWidth={1.9} />
    </div>
  )
}

export function AgentNode({ data }: NodeProps) {
  const d = data as unknown as StageData

  const statusText =
    d.state === "processing" && d.isActive
      ? "PROCESSING..."
      : d.isCompleted
        ? "COMPLETE"
        : d.statusLabel

  const isJudge = d.icon === "circleHelp"

  return (
    <motion.section
      initial={{ opacity: 0, y: 24, scale: 0.98 }}
      animate={{
        opacity: 1,
        y: 0,
        scale: d.isActive ? 1.015 : 1,
      }}
      transition={{ duration: 0.45 }}
      className={`workflow-node ${isJudge ? "workflow-node-judge" : ""} ${d.isPrimary ? "workflow-node-primary" : ""} ${d.isActive ? "workflow-node-active" : ""} ${d.isCompleted ? "workflow-node-complete" : ""}`}
    >
      <Handle type="target" position={Position.Top} className="workflow-port-handle" />

      {d.isPrimary ? (
        <button
          className="workflow-node-hitbox workflow-node-hitbox-primary"
          onClick={d.onToggleQuickInput}
          type="button"
          aria-expanded={d.isQuickInputOpen}
          aria-label={`Open quick input for ${d.title}`}
        >
          <CardContent d={d} statusText={statusText} isJudge={isJudge} />
        </button>
      ) : (
        <div className="workflow-node-frame">
          <CardContent d={d} statusText={statusText} isJudge={isJudge} />
        </div>
      )}

      {d.isPrimary && d.isQuickInputOpen ? (
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
              value={d.quickInputBusiness || ""}
              onChange={(e) => d.onQuickInputBusinessChange?.(e.target.value)}
              placeholder="Business description (e.g. AI-powered fitness app)"
            />
            <input
              className="quick-input-field"
              value={d.quickInputCompetitors || ""}
              onChange={(e) => d.onQuickInputCompetitorsChange?.(e.target.value)}
              placeholder="Competitor names, comma separated (optional)"
            />
            <div className="quick-input-row">
              <span className="quick-input-hint">Describe your business to start the research pipeline.</span>
              <button className="quick-input-action" type="button" onClick={d.onQuickInputSubmit}>Start</button>
            </div>
          </div>
        </motion.div>
      ) : null}

      {d.icon === "sparkles" && d.marketIntel && (
        <motion.aside
          initial={{ opacity: 0, x: 10, scale: 0.98 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          transition={{ duration: 0.24, ease: "easeOut" }}
          className="agent-results-panel"
        >
          <div className="agent-results-label">Market Intelligence</div>
          <div className="agent-results-title">Industry Research Complete</div>
          <p className="agent-results-copy">{d.marketIntel.industry_summary}</p>
          <div className="agent-results-list">
            {d.marketIntel.market_trends?.slice(0, 3).map((trend, i) => (
              <div key={i} className="agent-results-item">
                <span className="agent-results-key">Trend {i + 1}</span>
                <span className="agent-results-value">{trend}</span>
              </div>
            ))}
            {d.marketIntel.common_customer_pain_points?.slice(0, 2).map((pain, i) => (
              <div key={`pain-${i}`} className="agent-results-item">
                <span className="agent-results-key">Pain Point</span>
                <span className="agent-results-value">{pain}</span>
              </div>
            ))}
          </div>
        </motion.aside>
      )}

      {d.icon === "network" && d.isResultPanelVisible && d.competitorRecon ? (
        <motion.aside
          initial={{ opacity: 0, x: 10, scale: 0.98 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          transition={{ duration: 0.24, ease: "easeOut" }}
          className="agent-results-panel"
        >
          <div className="agent-results-label">Competitor Reconnaissance</div>
          <div className="agent-results-title">
            {d.competitorRecon.competitors?.length || 0} competitors analyzed
          </div>
          <div className="agent-results-list">
            {d.competitorRecon.competitors?.slice(0, 3).map((comp, i) => (
              <div key={i} className="agent-results-item" style={{ flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
                <span className="agent-results-key">{comp.name}</span>
                <span className="agent-results-value">{comp.positioning}</span>
                {comp.pricing_notes && (
                  <span className="agent-results-value" style={{ opacity: 0.7 }}>Pricing: {comp.pricing_notes}</span>
                )}
              </div>
            ))}
          </div>
        </motion.aside>
      ) : null}

      {d.icon === "workflow" && d.strategyOutput ? (
        <motion.aside
          initial={{ opacity: 0, x: -10, scale: 0.98 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          transition={{ duration: 0.24, ease: "easeOut" }}
          className="synthesis-prompt-panel"
        >
          <div className="synthesis-prompt-label">Strategy Output</div>
          <div className="synthesis-prompt-title">Recommended Strategy</div>
          <p className="synthesis-prompt-copy">{d.strategyOutput.messaging}</p>
          <div className="agent-results-list">
            <div className="agent-results-item">
              <span className="agent-results-key">Positioning</span>
              <span className="agent-results-value">{d.strategyOutput.positioning}</span>
            </div>
            <div className="agent-results-item">
              <span className="agent-results-key">Pricing</span>
              <span className="agent-results-value">{d.strategyOutput.pricing_recommendation}</span>
            </div>
            {d.strategyOutput.recommended_actions?.slice(0, 3).map((action, i) => (
              <div key={i} className="agent-results-item">
                <span className="agent-results-key">Action {i + 1}</span>
                <span className="agent-results-value">{action}</span>
              </div>
            ))}
          </div>
        </motion.aside>
      ) : null}

      {isJudge && d.judgeBroadcastActive ? (
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

      {isJudge && d.judgeFinalPanelVisible ? (
        <motion.aside
          initial={{ opacity: 0, x: -10, scale: 0.98 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          transition={{ duration: 0.24, ease: "easeOut" }}
          className="judge-final-panel"
        >
          <div className="judge-panel-label judge-panel-label-final">Final Judgment Panel</div>
          <div className="judge-panel-title">Verdict delivered</div>
          <div className="judge-verdict">Overall verdict: proceed with implementation</div>
          {d.strategyOutput ? (
            <div className="judge-summary-list">
              <div className="judge-summary-item">
                <span className="judge-summary-key">Positioning</span>
                <span className="judge-summary-value">{d.strategyOutput.positioning}</span>
              </div>
              <div className="judge-summary-item">
                <span className="judge-summary-key">Messaging</span>
                <span className="judge-summary-value">{d.strategyOutput.messaging}</span>
              </div>
              <div className="judge-summary-item">
                <span className="judge-summary-key">Pricing</span>
                <span className="judge-summary-value">{d.strategyOutput.pricing_recommendation}</span>
              </div>
              <div className="judge-summary-item">
                <span className="judge-summary-key">Actions</span>
                <span className="judge-summary-value">{d.strategyOutput.recommended_actions?.join("; ")}</span>
              </div>
            </div>
          ) : (
            <div className="judge-summary-list">
              <div className="judge-summary-item">
                <span className="judge-summary-key">Status</span>
                <span className="judge-summary-value">Pipeline complete</span>
              </div>
            </div>
          )}
        </motion.aside>
      ) : null}

      <Handle type="source" position={Position.Bottom} className="workflow-port-handle" />
    </motion.section>
  )
}

function CardContent({
  d,
  statusText,
  isJudge,
}: {
  d: StageData
  statusText: string
  isJudge: boolean
}) {
  return (
    <>
      <div className={`workflow-port ${d.isActive || d.isCompleted ? "workflow-port-active" : ""}`} />
      <div className={`workflow-card ${d.isPrimary ? "workflow-card-primary" : ""}`}>
        <div className="workflow-scan" />
        {isJudge ? <div className="workflow-card-judge-glow" /> : null}
        <div className="flex flex-col items-center gap-5 text-center">
          <span className="workflow-eyebrow">{d.eyebrow}</span>
          <StageIcon icon={d.icon} />
          <h2 className="workflow-title">{d.title}</h2>
          <p className="workflow-detail">{d.detail}</p>
          <div className="workflow-status">
            STATUS: <span>{statusText}</span>
          </div>
        </div>
        <div className="workflow-meter">
          <span
            className={`workflow-meter-fill ${d.isCompleted ? "workflow-meter-fill-complete" : d.isActive ? "workflow-meter-fill-active" : "workflow-meter-fill-idle"}`}
          />
        </div>
      </div>
    </>
  )
}
