import { ButtonHTMLAttributes, forwardRef } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
}

/**
 * Every colour here is a design-token ROLE (see `src/app/globals.css`), never
 * a raw Tailwind palette class. `primary` is the near-black `--primary` on
 * purpose — the product's one action colour is deliberately not a brand hue,
 * so a button can never be mistaken for a data series or a status signal.
 *
 * `danger` wears `--destructive`, which is a separate token from
 * `--status-critical`: this is an ACTION colour (delete this thing), that is a
 * MEASUREMENT colour (this metric is critical). They are allowed to look
 * similar; they are not allowed to be the same token, because they change for
 * different reasons.
 */
const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary-hover disabled:bg-primary-disabled",
  secondary: "bg-surface text-foreground border border-strong hover:bg-surface-hover",
  ghost: "bg-transparent text-secondary-foreground hover:bg-surface-hover",
  danger: "bg-destructive text-destructive-foreground hover:bg-destructive-hover disabled:bg-destructive-disabled",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", loading, disabled, className = "", children, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${variantClasses[variant]} ${className}`}
      {...rest}
    >
      {loading && (
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
        />
      )}
      {children}
    </button>
  );
});
