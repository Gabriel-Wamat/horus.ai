import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "./cn.js";

type ButtonVariant = "primary" | "ghost" | "panel" | "icon" | "danger";

const variantClassName: Record<ButtonVariant, string> = {
  primary: "primary-button",
  ghost: "ghost-button",
  panel: "panel-action",
  icon: "icon-button",
  danger: "panel-action danger",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  leadingIcon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", leadingIcon, className, children, type = "button", ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(variantClassName[variant], className)}
      {...props}
    >
      {leadingIcon}
      {children}
    </button>
  );
});
