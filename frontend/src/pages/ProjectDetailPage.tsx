import { useCallback, useRef } from "react"
import { useParams, Link } from "react-router-dom"
import { ArrowLeft } from "lucide-react"
import { useProjectsStore } from "@/stores/projects"
import { AgentPipeline } from "@/components/AgentPipeline"
import type { Node, Edge } from "@xyflow/react"

export function ProjectDetailPage() {
  const { id } = useParams()
  const project = useProjectsStore((s) => s.getProject(id ?? ""))
  const updateProject = useProjectsStore((s) => s.updateProject)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleStateChange = useCallback(
    (nodes: Node[], edges: Edge[]) => {
      if (!project) return
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
      saveTimeoutRef.current = setTimeout(() => {
        updateProject(project.id, { nodes, edges })
      }, 600)
    },
    [project?.id, updateProject]
  )

  if (!project) {
    return (
      <>
        <header className="aether-header">
          <div className="flex items-center gap-4">
            <Link to="/projects" className="back-link">
              <ArrowLeft className="size-4" />
            </Link>
            <h1 className="aether-title">Project not found</h1>
          </div>
        </header>
        <main className="aether-main">
          <div className="project-detail-empty">
            <p>This project doesn't exist.</p>
            <Link to="/projects" className="sidebar-cta">Back to Projects</Link>
          </div>
        </main>
      </>
    )
  }

  return (
    <AgentPipeline
      title={project.name}
      headerLeft={
        <Link to="/projects" className="back-link">
          <ArrowLeft className="size-4" />
        </Link>
      }
      onStateChange={handleStateChange}
    />
  )
}
