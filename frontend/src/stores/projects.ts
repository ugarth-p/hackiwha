import { create } from "zustand"
import type { Node, Edge } from "@xyflow/react"
import { makeDefaultNodes, makeDefaultEdges } from "@/components/AgentPipeline"

export type Project = {
  id: string
  name: string
  description: string
  createdAt: string
  nodes: Node[]
  edges: Edge[]
}

type ProjectsStore = {
  projects: Project[]
  createProject: (name: string, description: string) => string
  getProject: (id: string) => Project | undefined
  updateProject: (id: string, updates: Partial<Pick<Project, "name" | "description" | "nodes" | "edges">>) => void
  deleteProject: (id: string) => void
}

const exampleProjects: Project[] = [
  {
    id: "1cf343d9-f8ff-45e5-a76b-1ae04dd8efff",
    name: "Brand Analysis Pipeline",
    description: "Automated brand sentiment analysis using multi-agent evaluation.",
    createdAt: "2026-07-08",
    nodes: makeDefaultNodes(),
    edges: makeDefaultEdges(),
  },
  {
    id: "2cf343d9-f8ff-45e5-a76b-1ae04dd8efff",
    name: "Content Strategy Engine",
    description: "Generates and evaluates content strategies across multiple channels.",
    createdAt: "2026-07-09",
    nodes: makeDefaultNodes(),
    edges: makeDefaultEdges(),
  },
]

let nextId = 3

export const useProjectsStore = create<ProjectsStore>((set, get) => ({
  projects: exampleProjects,

  createProject: (name, description) => {
    const id = `proj-${nextId++}`
    const project: Project = {
      id,
      name,
      description,
      createdAt: new Date().toISOString().split("T")[0],
      nodes: makeDefaultNodes(),
      edges: makeDefaultEdges(),
    }
    set((state) => ({ projects: [...state.projects, project] }))
    return id
  },

  getProject: (id) => get().projects.find((p) => p.id === id),

  updateProject: (id, updates) =>
    set((state) => ({
      projects: state.projects.map((p) => (p.id === id ? { ...p, ...updates } : p)),
    })),

  deleteProject: (id) =>
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== id),
    })),
}))
