import { Handle, Position, type NodeProps } from "@xyflow/react"
import { motion } from "framer-motion"
import {
  CircleHelp,
  Network,
  Sparkles,
  Workflow,
} from "lucide-react"

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
  onToggleQuickInput?: () => void
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
              defaultValue="Neural Ingress"
              placeholder="Enter agent context"
            />
            <input
              className="quick-input-field"
              placeholder="Advertiser names, comma separated"
            />
            <div className="quick-input-row">
              <span className="quick-input-hint">Add advertiser names to scope the agent run.</span>
              <button className="quick-input-action" type="button">Start</button>
            </div>
          </div>
        </motion.div>
      ) : null}

      {d.icon === "network" && d.isResultPanelVisible ? (
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

      {d.icon === "workflow" && (d.isSynthesisPromptVisible || d.isSynthesisCronActive) ? (
        <motion.aside
          initial={{ opacity: 0, x: -10, scale: 0.98 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          transition={{ duration: 0.24, ease: "easeOut" }}
          className="synthesis-prompt-panel"
        >
          {d.isSynthesisCronActive ? (
            <>
              <div className="synthesis-prompt-label">Third Agent Cron</div>
              <div className="synthesis-prompt-title">Restarting the first agent</div>
              <p className="synthesis-prompt-copy">
                The cycle is running. When the timer ends, the first agent will restart automatically.
              </p>
              <div className="synthesis-cron-timer">
                <div className="synthesis-cron-value">{String(d.synthesisCronSecondsLeft).padStart(2, "0")}</div>
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
                  value={d.synthesisPromptValue}
                  onChange={(event) => d.onSynthesisPromptChange?.(event.target.value)}
                  placeholder="Validate the plan or describe an implementation"
                />
                <div className="synthesis-prompt-row">
                  <span className="synthesis-prompt-hint">
                    The synthesis agent will continue after your confirmation.
                  </span>
                  <button className="synthesis-prompt-action" type="button" onClick={d.onSynthesisPromptSubmit}>OK</button>
                </div>
              </div>
            </>
          )}
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
