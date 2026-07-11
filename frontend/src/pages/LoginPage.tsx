import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { useAuthStore } from "@/stores/auth"
import DotField from "@/components/DotField"

export function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [error, setError] = useState("")
  const login = useAuthStore((s) => s.login)
  const navigate = useNavigate()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email || !password) {
      setError("Please fill in all fields")
      return
    }
    setError("")
    setIsSubmitting(true)
    setLeaving(true)
    setTimeout(() => {
      login(email)
      navigate("/projects", { replace: true })
    }, 500)
  }

  return (
    <div className="login-page">
      <DotField
        dotRadius={1.1}
        dotSpacing={24}
        cursorRadius={160}
        bulgeStrength={40}
        gradientFrom="rgba(255, 0, 113, 0.18)"
        gradientTo="rgba(255, 136, 180, 0.10)"
      />
      <AnimatePresence>
        {!leaving && (
          <motion.div
            key="login-card"
            className="login-card"
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.97, filter: "blur(6px)" }}
            transition={{ duration: 0.45, ease: "easeOut" }}
          >
        <div className="login-logo">
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
            <rect width="36" height="36" rx="10" fill="#ff0071" />
            <path
              d="M10 18C10 13.582 13.582 10 18 10C22.418 10 26 13.582 26 18"
              stroke="white"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <path
              d="M14 18C14 15.791 15.791 14 18 14C20.209 14 22 15.791 22 18"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <circle cx="18" cy="18" r="2" fill="white" />
          </svg>
        </div>
        <h1 className="login-title">Aether Intelligence</h1>
        <p className="login-subtitle">Sign in to your workspace</p>
        <form className="login-form" onSubmit={handleSubmit}>
          <label className="login-field">
            <span className="login-label">Email</span>
            <input
              type="email"
              className="login-input"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </label>
          <label className="login-field">
            <span className="login-label">Password</span>
            <input
              type="password"
              className="login-input"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </label>
          {error && <p className="login-error">{error}</p>}
          <button
            type="submit"
            className="login-button"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Signing in..." : "Sign In"}
          </button>
        </form>
        <p className="login-hint">Any email and password will work</p>
      </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default LoginPage
