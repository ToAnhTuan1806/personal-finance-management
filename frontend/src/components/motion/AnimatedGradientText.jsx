// Adapted from Magic UI Animated Gradient Text (MIT).
import { cn } from '../../lib/utils.js'

export default function AnimatedGradientText({ children, className }) {
  return (
    <span className={cn('inline bg-linear-to-r from-primary via-highlight to-primary bg-size-[300%_100%] bg-clip-text text-transparent motion-safe:animate-gradient', className)}>
      {children}
    </span>
  )
}
