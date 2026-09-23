import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

// Design system: black is the only filled button; secondary actions are ghost-outlined in the hairline
// color; controls are 4px or a full pill; no shadows. shadcn's `secondary` and `destructive` variants
// are removed because the system has no colored or tinted CTA.
const buttonVariants = cva(
  "group/button inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-buttons border border-transparent bg-clip-padding font-medium whitespace-nowrap transition-colors outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // Filled Black Button
        default: "bg-primary text-primary-foreground hover:bg-graphite",
        // Ghost Outline Button
        outline:
          "border-border bg-transparent text-foreground hover:border-foreground aria-expanded:border-foreground",
        ghost:
          "text-muted-foreground hover:text-foreground aria-expanded:text-foreground",
        link: "h-auto! px-0! text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground",
      },
      size: {
        // 12px × 24px padding around 16px / 1.5 type
        default: "h-12 px-6 text-body-sm",
        sm: "h-9 px-4 text-caption",
        // Nav pill: pair with variant="default" for the active page, "ghost" otherwise
        pill: "h-8 rounded-full px-3 text-caption",
        icon: "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
