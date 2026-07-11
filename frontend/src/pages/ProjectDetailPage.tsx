import { Link } from "react-router-dom"
import { ArrowLeft } from "lucide-react"
import { useProjectsStore } from "@/stores/projects"
import { useParams } from "react-router-dom"
import { AgentPipeline } from "@/components/AgentPipeline"

export function ProjectDetailPage() {
  const { id } = useParams()
  const project = useProjectsStore((s) => s.getProject(id ?? ""))

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
      tenantId={project.id}
      businessDescription={project.description}
      headerLeft={
        <Link to="/projects" className="back-link">
          <ArrowLeft className="size-4" />
        </Link>
      }
    />
  )
}
