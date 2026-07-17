"use client"

// Migrated
// framer-motion -> motion/react, dropped unused useAnimation/
// useMotionValue/useTransform imports (dead in source), swapped
// hardcoded blue/purple defaults for Sigil's CSS token vars per the
// ux-design-language "challenge default AI blue/purple palettes" rule.
// Demo/selector wrapper stripped — these are the primitives only.

import { useEffect, useId, useMemo, useRef, useState } from "react"
import { motion } from "motion/react"
import { cn } from "@workspace/ui/lib/utils"
import { createSeededRandom } from "@workspace/ui/lib/seeded-random"

interface ParticleProps {
  className?: string
  particleCount?: number
  speed?: number
  color?: string
}

export function ParticleBackground({
  className,
  particleCount = 50,
  speed = 1,
  color = "var(--color-muted-foreground)",
}: ParticleProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const resolvedColor = getComputedStyle(canvas).color
    const particles: Array<{ x: number; y: number; vx: number; vy: number; size: number; opacity: number }> = []

    const resizeCanvas = () => {
      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
    }

    const initParticles = () => {
      particles.length = 0
      for (let i = 0; i < particleCount; i++) {
        particles.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          vx: (Math.random() - 0.5) * speed,
          vy: (Math.random() - 0.5) * speed,
          size: Math.random() * 2 + 1,
          opacity: Math.random() * 0.5 + 0.1,
        })
      }
    }

    let raf: number
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      particles.forEach((particle) => {
        particle.x += particle.vx
        particle.y += particle.vy
        if (particle.x < 0 || particle.x > canvas.width) particle.vx *= -1
        if (particle.y < 0 || particle.y > canvas.height) particle.vy *= -1

        ctx.beginPath()
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2)
        ctx.globalAlpha = particle.opacity
        ctx.fillStyle = resolvedColor
        ctx.fill()
      })
      ctx.globalAlpha = 1
      raf = requestAnimationFrame(animate)
    }

    resizeCanvas()
    initParticles()
    animate()

    const onResize = () => {
      resizeCanvas()
      initParticles()
    }
    window.addEventListener("resize", onResize)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("resize", onResize)
    }
  }, [particleCount, speed])

  return <canvas ref={canvasRef} style={{ color }} className={cn("pointer-events-none absolute inset-0", className)} />
}

interface GeometricProps {
  className?: string
  shapeCount?: number
  animationSpeed?: number
  /** Same seed -> same layout every time, including matching between SSR and the client. */
  seed?: number
}

export function GeometricBackground({ className, shapeCount = 20, animationSpeed = 1, seed = 1 }: GeometricProps) {
  // Seeded instead of Math.random(): a fixed seed produces the identical
  // sequence on the server and the client's first render, so there's no
  // SSR/hydration mismatch to work around in the first place — no mount
  // gate needed.
  const shapes = useMemo(() => {
    const rand = createSeededRandom(seed)
    return Array.from({ length: shapeCount }, (_, i) => ({
      id: i,
      size: rand() * 100 + 20,
      x: rand() * 100,
      y: rand() * 100,
      rotation: rand() * 360,
      opacity: rand() * 0.3 + 0.1,
      type: rand() > 0.5 ? "circle" : "square",
      durationSeed: rand() * 10,
    }))
  }, [seed, shapeCount])

  return (
    <div className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      {shapes.map((shape) => (
        <motion.div
          key={shape.id}
          className={cn(
            "absolute bg-gradient-to-br from-primary/20 to-primary/5",
            shape.type === "circle" ? "rounded-full" : "rounded-lg"
          )}
          style={{ width: shape.size, height: shape.size, left: `${shape.x}%`, top: `${shape.y}%`, opacity: shape.opacity }}
          animate={{ rotate: [shape.rotation, shape.rotation + 360], scale: [1, 1.2, 1] }}
          transition={{ duration: (10 + shape.durationSeed) / animationSpeed, repeat: Infinity, ease: "linear" }}
        />
      ))}
    </div>
  )
}

interface WaveProps {
  className?: string
  amplitude?: number
  frequency?: number
  speed?: number
  color?: string
}

export function WaveBackground({ className, amplitude = 50, frequency = 0.02, speed = 1, color = "currentColor" }: WaveProps) {
  const pathRef = useRef<SVGPathElement>(null)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const updateDimensions = () => setDimensions({ width: window.innerWidth, height: window.innerHeight })
    updateDimensions()
    window.addEventListener("resize", updateDimensions)
    return () => window.removeEventListener("resize", updateDimensions)
  }, [])

  useEffect(() => {
    if (!pathRef.current) return
    let time = 0
    let raf: number
    const animate = () => {
      time += 0.01 * speed
      const path: string[] = []
      const points = 100
      for (let i = 0; i <= points; i++) {
        const x = (i / points) * dimensions.width
        const y = dimensions.height / 2 + Math.sin(x * frequency + time) * amplitude
        path.push(i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`)
      }
      path.push(`L ${dimensions.width} ${dimensions.height}`, `L 0 ${dimensions.height}`, "Z")
      pathRef.current?.setAttribute("d", path.join(" "))
      raf = requestAnimationFrame(animate)
    }
    animate()
    return () => cancelAnimationFrame(raf)
  }, [dimensions, amplitude, frequency, speed])

  return (
    <svg className={cn("pointer-events-none absolute inset-0", className)} width="100%" height="100%">
      <path ref={pathRef} fill={color} opacity="0.1" />
    </svg>
  )
}

interface GridProps {
  className?: string
  size?: number
  color?: string
  animated?: boolean
}

export function GridBackground({ className, size = 40, color = "currentColor", animated = true }: GridProps) {
  // Instance-scoped ids — a hardcoded id="grid" would collide (invalid
  // duplicate DOM ids, and both rects resolving to whichever pattern
  // rendered first) as soon as two GridBackgrounds render on one page.
  const uid = useId()
  const gridId = `grid-${uid}`
  const animatedGridId = `animated-grid-${uid}`

  return (
    <div className={cn("pointer-events-none absolute inset-0", className)}>
      <svg className="h-full w-full">
        <defs>
          <pattern id={gridId} width={size} height={size} patternUnits="userSpaceOnUse">
            <path d={`M ${size} 0 L 0 0 0 ${size}`} fill="none" stroke={color} strokeWidth="1" opacity="0.1" />
          </pattern>
          {animated && (
            <pattern id={animatedGridId} width={size * 2} height={size * 2} patternUnits="userSpaceOnUse">
              <motion.rect
                x="0"
                y="0"
                width={size}
                height={size}
                fill={color}
                opacity="0.05"
                animate={{ opacity: [0.05, 0.15, 0.05] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              />
            </pattern>
          )}
        </defs>
        <rect width="100%" height="100%" fill={`url(#${gridId})`} />
        {animated && <rect width="100%" height="100%" fill={`url(#${animatedGridId})`} />}
      </svg>
    </div>
  )
}

interface GradientProps {
  className?: string
  colors?: string[]
  animated?: boolean
}

export function GradientBackground({
  className,
  colors = ["var(--color-primary)", "var(--color-accent)", "var(--color-muted)"],
  animated = true,
}: GradientProps) {
  return (
    <motion.div
      className={cn("pointer-events-none absolute inset-0", className)}
      style={{ background: `linear-gradient(-45deg, ${colors.join(", ")})`, backgroundSize: "400% 400%" }}
      animate={animated ? { backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] } : {}}
      transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
    />
  )
}

interface DotsProps {
  className?: string
  dotSize?: number
  spacing?: number
  color?: string
  animated?: boolean
  /** Same seed -> same animation delay every time, including matching between SSR and the client. */
  seed?: number
}

export function DotsBackground({ className, dotSize = 2, spacing = 30, color = "currentColor", animated = true, seed = 1 }: DotsProps) {
  // Seeded instead of Math.random() — the delay stays fixed across
  // re-renders (computed once via useMemo) and matches between SSR and
  // the client's first render (same seed -> same value on both).
  const delay = useMemo(() => createSeededRandom(seed)() * 2, [seed])
  // Instance-scoped id — a hardcoded id="dots" would collide as soon as
  // two DotsBackgrounds render on one page.
  const dotsId = `dots-${useId()}`

  return (
    <div className={cn("pointer-events-none absolute inset-0", className)}>
      <svg className="h-full w-full">
        <defs>
          <pattern id={dotsId} x="0" y="0" width={spacing} height={spacing} patternUnits="userSpaceOnUse">
            <motion.circle
              cx={spacing / 2}
              cy={spacing / 2}
              r={dotSize}
              fill={color}
              opacity="0.1"
              // Animating only opacity, not r: motion animating an SVG
              // attribute on an element inside a <pattern> (never actually
              // painted directly, only referenced via fill="url(#dots)")
              // throws a transient "Expected length, undefined" console
              // error on first mount even though the final rendered value
              // is correct — sidestepped by not animating r at all.
              animate={animated ? { opacity: [0.1, 0.3, 0.1] } : {}}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay }}
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${dotsId})`} />
      </svg>
    </div>
  )
}
