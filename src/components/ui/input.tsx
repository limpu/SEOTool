import { InputHTMLAttributes, forwardRef } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string;
}

/**
 * Focus ring is `--ring` (the accent blue), the same hue the app uses for
 * links and active nav, so interactive chrome reads as one system. It is
 * never removed — `focus:outline-none` here is paired with an explicit
 * `focus:ring-2`, so the keyboard affordance is replaced, not deleted.
 *
 * The error border wears `--destructive` (an action/validation signal), not
 * `--status-critical` (a measurement signal).
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { error, className = "", id, ...rest },
  ref
) {
  return (
    <input
      ref={ref}
      id={id}
      aria-invalid={!!error}
      aria-describedby={error ? `${id}-error` : undefined}
      className={`w-full rounded-md border bg-surface px-3 py-2.5 text-sm text-foreground placeholder:text-muted focus:border-transparent focus:ring-2 focus:ring-ring focus:outline-none ${
        error ? "border-destructive" : "border-strong"
      } ${className}`}
      {...rest}
    />
  );
});
