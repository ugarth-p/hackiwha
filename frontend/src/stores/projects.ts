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
    id: "550e8400-e29b-41d4-a716-446655440001",
    name: "Brand Analysis Pipeline",
    description: "Automated brand sentiment analysis using multi-agent evaluation.",
    createdAt: "2026-07-08",
    nodes: makeDefaultNodes(),
    edges: makeDefaultEdges(),
  },
  {
    id: "550e8400-e29b-41d4-a716-446655440002",
    name: "Content Strategy Engine",
    description: "Generates and evaluates content strategies across multiple channels.",
    createdAt: "2026-07-09",
    nodes: makeDefaultNodes(),
    edges: makeDefaultEdges(),
  },
]

export const useProjectsStore = create<ProjectsStore>((set, get) => ({
  projects: exampleProjects,

  createProject: (name, description) => {
    const id = crypto.randomUUID()
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
