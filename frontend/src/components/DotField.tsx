import { useEffect, useRef, memo } from "react"

const TWO_PI = Math.PI * 2

type DotFieldProps = {
  dotRadius?: number
  dotSpacing?: number
  cursorRadius?: number
  cursorForce?: number
  bulgeOnly?: boolean
  bulgeStrength?: number
  gradientFrom?: string
  gradientTo?: string
  className?: string
}

const DotField = memo(function DotField({
  dotRadius = 1.2,
  dotSpacing = 22,
  cursorRadius = 180,
  cursorForce = 0.08,
  bulgeOnly = true,
  bulgeStrength = 48,
  gradientFrom = "rgba(255, 0, 113, 0.22)",
  gradientTo = "rgba(255, 136, 180, 0.14)",
  className,
}: DotFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const ctxRef = useRef<CanvasRenderingContext2D>(null!)
  const sizeRef = useRef({ w: 0, h: 0, offsetX: 0, offsetY: 0 })
  const dotsRef = useRef<Array<{ ax: number; ay: number; sx: number; sy: number; vx: number; vy: number }>>([])
  const mouseRef = useRef({ x: -9999, y: -9999, prevX: -9999, prevY: -9999, speed: 0 })
  const rafRef = useRef<number>(0)
  const engagement = useRef(0)
  const propsRef = useRef({ dotRadius, dotSpacing, cursorRadius, cursorForce, bulgeOnly, bulgeStrength, gradientFrom, gradientTo })
  propsRef.current = { dotRadius, dotSpacing, cursorRadius, cursorForce, bulgeOnly, bulgeStrength, gradientFrom, gradientTo }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d", { alpha: true })
    if (!ctx) return
    ctxRef.current = ctx

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let resizeTimer: ReturnType<typeof setTimeout>

    function doResize() {
      const parent = canvas!.parentElement
      if (!parent) return
      const rect = parent.getBoundingClientRect()
      const w = rect.width
      const h = rect.height
      canvas!.width = w * dpr
      canvas!.height = h * dpr
      canvas!.style.width = `${w}px`
      canvas!.style.height = `${h}px`
      ctxRef.current.setTransform(dpr, 0, 0, dpr, 0, 0)
      sizeRef.current = {
        w,
        h,
        offsetX: rect.left + window.scrollX,
        offsetY: rect.top + window.scrollY,
      }
      buildDots(w, h)
    }

    function resize() {
      clearTimeout(resizeTimer)
      resizeTimer = setTimeout(doResize, 100)
    }

    function buildDots(w: number, h: number) {
      const p = propsRef.current
      const step = p.dotRadius + p.dotSpacing
      const cols = Math.floor(w / step)
      const rows = Math.floor(h / step)
      const padX = (w % step) / 2
      const padY = (h % step) / 2
      const dots = new Array(rows * cols)
      let idx = 0
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const ax = padX + col * step + step / 2
          const ay = padY + row * step + step / 2
          dots[idx++] = { ax, ay, sx: ax, sy: ay, vx: 0, vy: 0 }
        }
      }
      dotsRef.current = dots
    }

    function onMouseMove(e: MouseEvent) {
      const s = sizeRef.current
      mouseRef.current.x = e.pageX - s.offsetX
      mouseRef.current.y = e.pageY - s.offsetY
    }

    function updateMouseSpeed() {
      const m = mouseRef.current
      const dx = m.prevX - m.x
      const dy = m.prevY - m.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      m.speed += (dist - m.speed) * 0.5
      if (m.speed < 0.001) m.speed = 0
      m.prevX = m.x
      m.prevY = m.y
    }

    const speedInterval = setInterval(updateMouseSpeed, 20)
    let frameCount = 0

    function tick() {
      const c = ctxRef.current
      frameCount++
      const dots = dotsRef.current
      const m = mouseRef.current
      const { w, h } = sizeRef.current
      const p = propsRef.current
      const len = dots.length

      const targetEngagement = Math.min(m.speed / 5, 1)
      engagement.current += (targetEngagement - engagement.current) * 0.06
      if (engagement.current < 0.001) engagement.current = 0
      const eng = engagement.current

      c.clearRect(0, 0, w, h)

      const grad = c.createLinearGradient(0, 0, w, h)
      grad.addColorStop(0, p.gradientFrom)
      grad.addColorStop(1, p.gradientTo)
      c.fillStyle = grad

      const cr = p.cursorRadius
      const crSq = cr * cr
      const rad = p.dotRadius / 2
      const isBulge = p.bulgeOnly

      c.beginPath()

      for (let i = 0; i < len; i++) {
        const d = dots[i]
        const dx = m.x - d.ax
        const dy = m.y - d.ay
        const distSq = dx * dx + dy * dy

        if (distSq < crSq && eng > 0.01) {
          const dist = Math.sqrt(distSq)
          if (isBulge) {
            const t = 1 - dist / cr
            const push = t * t * p.bulgeStrength * eng
            const angle = Math.atan2(dy, dx)
            d.sx += (d.ax - Math.cos(angle) * push - d.sx) * 0.15
            d.sy += (d.ay - Math.sin(angle) * push - d.sy) * 0.15
          } else {
            const angle = Math.atan2(dy, dx)
            const move = (500 / dist) * (m.speed * p.cursorForce)
            d.vx += Math.cos(angle) * -move
            d.vy += Math.sin(angle) * -move
          }
        } else if (isBulge) {
          d.sx += (d.ax - d.sx) * 0.1
          d.sy += (d.ay - d.sy) * 0.1
        }

        if (!isBulge) {
          d.vx *= 0.9
          d.vy *= 0.9
          d.sx = d.ax + d.vx
          d.sy = d.ay + d.vy
        }

        c.moveTo(d.sx + rad, d.sy)
        c.arc(d.sx, d.sy, rad, 0, TWO_PI)
      }

      c.fill()
      rafRef.current = requestAnimationFrame(tick)
    }

    doResize()
    window.addEventListener("resize", resize)
    window.addEventListener("mousemove", onMouseMove, { passive: true })
    rafRef.current = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(rafRef.current)
      clearInterval(speedInterval)
      clearTimeout(resizeTimer)
      window.removeEventListener("resize", resize)
      window.removeEventListener("mousemove", onMouseMove)
    }
  }, [])

  return (
    <div
      className={className}
      style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}
    >
      <canvas
        ref={canvasRef}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      />
    </div>
  )
})

export default DotField
