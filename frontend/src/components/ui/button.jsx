// Adapted from the shadcn/ui New York Button registry (MIT).
import { Slot } from '@radix-ui/react-slot'
import { cva } from 'class-variance-authority'
import { cn } from '../../lib/utils.js'

const buttonVariants = cva(
  'inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        outline: 'border border-border bg-card text-card-foreground hover:bg-accent hover:text-accent-foreground',
        ghost: 'text-foreground hover:bg-accent hover:text-accent-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

export function Button({ className, variant, asChild = false, type, ...props }) {
  const Component = asChild ? Slot : 'button'
  return (
    <Component
      data-slot="button"
      className={cn(buttonVariants({ variant }), className)}
      {...(!asChild && { type: type ?? 'button' })}
      {...props}
    />
  )
}
