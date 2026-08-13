import { Link } from "react-router-dom";
import { ButtonHTMLAttributes, ReactNode } from "react";

export function IconEdit() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path fill="currentColor" d="M11.7 1.3a1 1 0 0 1 1.4 0l1.6 1.6a1 1 0 0 1 0 1.4L6.4 12.6 3 13.7l1.1-3.4 8.6-8.9ZM2 14.5h12v1.2H2v-1.2Z" />
    </svg>
  );
}

export function IconDelete() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path fill="currentColor" d="M6 1h4l.5 1H14v1.5H2V2h3.5L6 1Zm1 4h1.5v7H7V5Zm3 0H11.5v7H10V5ZM4.5 5H6v7H4.5V5ZM3 13.5h10V15H3v-1.5Z" />
    </svg>
  );
}

export function EditButton({ children = "Edit", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { children?: ReactNode }) {
  return (
    <button type="button" className={`btn-edit ${className}`.trim()} {...props}>
      <IconEdit /> {children}
    </button>
  );
}

export function DeleteButton({ children = "Delete", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { children?: ReactNode }) {
  return (
    <button type="button" className={`btn-delete ${className}`.trim()} {...props}>
      <IconDelete /> {children}
    </button>
  );
}

export function EditLink({ to, children = "Edit" }: { to: string; children?: ReactNode }) {
  return (
    <Link className="btn-edit" to={to}>
      <IconEdit /> {children}
    </Link>
  );
}
