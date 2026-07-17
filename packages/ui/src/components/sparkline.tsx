import { cn } from "@workspace/ui/lib/utils"

interface SparkLineProps {
  data: number[]
  width?: number
  height?: number
  className?: string
  color?: string
}

function SparkLine({
  data,
  width = 80,
  height = 24,
  className,
  color = "currentColor",
}: SparkLineProps) {
  if (data.length < 2) return null

  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1

  const points = data.map((value, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - ((value - min) / range) * (height - 2) - 1
    return `${x},${y}`
  })

  const linePath = `M${points.join(" L")}`
  const areaPath = `${linePath} L${width},${height} L0,${height} Z`

  return (
    <svg
      data-slot="sparkline"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn("inline-block text-primary", className)}
      aria-hidden="true"
    >
      <path
        d={areaPath}
        fill={color}
        fillOpacity={0.15}
      />
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export { SparkLine }
export type { SparkLineProps }
