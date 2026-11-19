// CSS adaptation of React Bits Shiny Text (MIT).
import { cn } from '../../lib/utils.js'

export default function ShinyText({ children, className }) {
  return <span className={cn('se-shiny-text', className)}>{children}</span>
}
