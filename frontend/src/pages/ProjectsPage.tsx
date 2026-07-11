import { useState } from "react"
import { Link } from "react-router-dom"
import { motion } from "framer-motion"
import { Plus, ArrowRight, Trash2 } from "lucide-react"
import { useProjectsStore } from "@/stores/projects"

export function ProjectsPage() {
  const { projects, createProject, deleteProject } = useProjectsStore()
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState("")
  const [newDesc, setNewDesc] = useState("")

  const handleCreate = () => {
    if (!newName.trim()) return
    createProject(newName.trim(), newDesc.trim())
    setNewName("")
    setNewDesc("")
    setShowCreate(false)
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
    >
      <header className="aether-header">
        <div className="flex items-center gap-8">
          <div>
            <h1 className="aether-title">Projects</h1>
          </div>
          <nav className="hidden items-center gap-8 md:flex">
            <a className="aether-tab aether-tab-active" href="#" onClick={(e) => e.preventDefault()}>
              All Projects
            </a>
            <a className="aether-tab" href="#" onClick={(e) => e.preventDefault()}>
              Archived
            </a>
          </nav>
        </div>
        <div className="flex items-center gap-4 sm:gap-6">
          <button
            className="launch-button"
            onClick={() => setShowCreate((c) => !c)}
            type="button"
          >
            <Plus className="size-4" />
            New Project
          </button>
          <div className="profile-chip">
            <div className="profile-initials">AH</div>
          </div>
        </div>
      </header>

      <main className="aether-main">
        {showCreate ? (
          <div className="project-create-form">
            <div className="project-create-header">Create New Project</div>
            <div className="project-create-fields">
              <input
                className="project-create-input"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Project name"
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") handleCreate() }}
              />
              <input
                className="project-create-input"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Description (optional)"
                onKeyDown={(e) => { if (e.key === "Enter") handleCreate() }}
              />
              <div className="project-create-actions">
                <button
                  className="sidebar-cta"
                  onClick={handleCreate}
                  type="button"
                  disabled={!newName.trim()}
                >
                  Create
                </button>
                <button
                  className="project-create-cancel"
                  onClick={() => { setShowCreate(false); setNewName(""); setNewDesc("") }}
                  type="button"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="projects-grid">
          {projects.map((project) => (
            <Link
              key={project.id}
              to={`/projects/${project.id}`}
              className="project-card"
            >
              <div className="project-card-top">
                <div className="project-card-name">{project.name}</div>
                <button
                  className="project-card-delete"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    deleteProject(project.id)
                  }}
                  type="button"
                  aria-label={`Delete ${project.name}`}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
              <p className="project-card-desc">
                {project.description || "No description"}
              </p>
              <div className="project-card-meta">
                <span>{project.nodes.length} nodes</span>
                <span>{project.createdAt}</span>
              </div>
              <div className="project-card-footer">
                <span className="project-card-open">Open Flow</span>
                <ArrowRight className="size-3.5" />
              </div>
            </Link>
          ))}
        </div>

        {projects.length === 0 ? (
          <div className="projects-empty">
            <p>No projects yet.</p>
            <button
              className="sidebar-cta"
              onClick={() => setShowCreate(true)}
              type="button"
            >
              <Plus className="size-4" />
              Create your first project
            </button>
          </div>
        ) : null}
      </main>
    </motion.div>
  )
}
