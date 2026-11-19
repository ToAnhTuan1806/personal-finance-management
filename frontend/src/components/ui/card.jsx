// Adapted from the shadcn/ui New York Card registry (MIT).
import { cn } from '../../lib/utils.js'

export function Card({ className, ...props }) {
  return (
    <div
      data-slot="card"
      className={cn('flex min-w-0 flex-col gap-4 rounded-3xl border border-border bg-card py-5 text-card-foreground shadow-panel', className)}
      {...props}
    />
  )
}

export function CardContent({ className, ...props }) {
  return <div data-slot="card-content" className={cn('px-5 sm:px-6', className)} {...props} />
}
