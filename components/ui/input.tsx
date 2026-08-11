import * as React from 'react'

import { cn } from '@/lib/utils'

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'flex h-10 w-full min-w-0 rounded-lg border border-input bg-card px-3.5 py-2.5 text-sm text-foreground outline-none transition',
        'placeholder:text-muted-foreground',
        'focus:border-primary focus:ring-2 focus:ring-primary/30',
        'aria-[invalid=true]:border-destructive aria-[invalid=true]:focus:ring-destructive/30',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
