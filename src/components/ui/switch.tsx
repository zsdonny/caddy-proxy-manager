"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Pure HTML switch — drop-in replacement for the Radix UI `<Switch>`.
 *
 * Why: Radix Switch 1.2.x uses `useComposedRefs(forwardedRef, (node) =>
 * setButton(node))` internally.  The inline arrow has a new identity every
 * render, so `useComposedRefs` (backed by `React.useCallback(…, refs)`)
 * returns a new callback ref every render.  React 19 treats a changing
 * callback-ref identity as "cleanup old (call with null) → attach new (call
 * with node)", which oscillates the internal `button` state between `null` and
 * `node` indefinitely → "Maximum update depth exceeded".
 *
 * This implementation keeps the exact same public API, ARIA attributes, and
 * `data-state` / `data-disabled` attributes so existing Tailwind selectors
 * continue to work.  No `@radix-ui/react-compose-refs` involved.
 */
const Switch = React.forwardRef<
  HTMLButtonElement,
  Omit<React.ComponentPropsWithoutRef<"button">, "onChange"> & {
    checked?: boolean
    defaultChecked?: boolean
    required?: boolean
    onCheckedChange?: (checked: boolean) => void
    name?: string
    value?: string
  }
>(({ className, checked: checkedProp, defaultChecked, required, onCheckedChange, value = "on", name, disabled, ...props }, ref) => {
  const isControlled = checkedProp !== undefined
  const [internalChecked, setInternalChecked] = React.useState(defaultChecked ?? false)
  const checked = isControlled ? checkedProp : internalChecked
  const state = checked ? "checked" : "unchecked"

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-required={required}
      data-state={state}
      data-disabled={disabled ? "" : undefined}
      disabled={disabled}
      value={value}
      className={cn(
        "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input active:scale-95 hover:ring-2 hover:ring-primary/35",
        className
      )}
      {...props}
      ref={ref}
      onClick={(e) => {
        props.onClick?.(e)
        if (e.defaultPrevented) return
        const next = !checked
        if (!isControlled) setInternalChecked(next)
        onCheckedChange?.(next)
      }}
    >
      <span
        data-state={state}
        data-disabled={disabled ? "" : undefined}
        className="pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0"
      />
      {name && (
        // Hidden checkbox for form submission — not interactive, styled offscreen
        // eslint-disable-next-line jsx-a11y/label-has-associated-control
        <input
          type="checkbox"
          aria-hidden
          tabIndex={-1}
          checked={checked}
          name={name}
          value={value}
          required={required}
          disabled={disabled}
          readOnly
          className="absolute pointer-events-none opacity-0 m-0 w-0 h-0"
        />
      )}
    </button>
  )
})
Switch.displayName = "Switch"

export { Switch }
