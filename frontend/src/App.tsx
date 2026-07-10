import { Routes, Route } from "react-router-dom"

import { SplashPage } from "./pages/SplashPage"
import { LoginPage } from "./pages/LoginPage"
import { ProjectsPage } from "./pages/ProjectsPage"
import { ProjectDetailPage } from "./pages/ProjectDetailPage"
import { AgentsPage } from "./pages/AgentsPage"

export function App() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f5f5f5] text-black">
      <Routes>
        <Route path="/" element={<SplashPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/:id" element={<ProjectDetailPage />} />
        <Route path="/agents" element={<AgentsPage />} />
      </Routes>
    </div>
  )
}

export default App
