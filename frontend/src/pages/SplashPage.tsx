import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import DotField from "@/components/DotField"

export function SplashPage() {
  const navigate = useNavigate()
  const [leaving, setLeaving] = useState(false)

  function handleGetStarted() {
    setLeaving(true)
    setTimeout(() => navigate("/login"), 450)
  }

  return (
    <div className="splash-page">
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
            className="splash-content"
            key="splash"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -30, scale: 0.96, filter: "blur(6px)" }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          >
            <div className="splash-logo">
              <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
                <rect width="56" height="56" rx="16" fill="#ff0071" />
                <path
                  d="M14 28C14 20.268 20.268 14 28 14C35.732 14 42 20.268 42 28"
                  stroke="white"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
                <path
                  d="M20 28C20 23.582 23.582 20 28 20C32.418 20 36 23.582 36 28"
                  stroke="white"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
                <circle cx="28" cy="28" r="3.5" fill="white" />
              </svg>
            </div>
            <motion.h1
              className="splash-title"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.15, ease: "easeOut" }}
            >
              Aether Intelligence
            </motion.h1>
            <motion.p
              className="splash-tagline"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.3, ease: "easeOut" }}
            >
              Autonomous multi-agent workflows,<br />engineered for clarity.
            </motion.p>
            <motion.button
              className="splash-button"
              onClick={handleGetStarted}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.5, ease: "easeOut" }}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
            >
              Get Started
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="splash-footer">
        <span>Powered by multi-agent orchestration</span>
      </div>
    </div>
  )
}

export default SplashPage
