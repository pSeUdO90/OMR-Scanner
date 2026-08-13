import { Link } from "react-router-dom";
import { ButtonHTMLAttributes, ReactNode } from "react";

export function IconEdit() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path fill="currentColor" d="M11.7 1.3a1 1 0 0 1 1.4 0l1.6 1.6a1 1 0 0 1 0 1.4L6.4 12.6 3 13.7l1.1-3.4 8.6-8.9ZM2 14.5h12v1.2H2v-1.2Z" />
    </svg>
  );
}

export function IconView() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path fill="currentColor" d="M8 3c3.3 0 6.2 2 7.5 5-1.3 3-4.2 5-7.5 5S1.8 11 .5 8C1.8 5 4.7 3 8 3Zm0 2.2A2.8 2.8 0 1 0 8 10.8 2.8 2.8 0 0 0 8 5.2Z" />
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

export function ViewButton({ children = "View", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { children?: ReactNode }) {
  return (
    <button type="button" className={`btn-view ${className}`.trim()} {...props}>
      <IconView /> {children}
    </button>
  );
}

export function ViewLink({ to, children = "View" }: { to: string; children?: ReactNode }) {
  return (
    <Link className="btn-view" to={to}>
      <IconView /> {children}
    </Link>
  );
}

export function EditLink({ to, children = "Edit" }: { to: string; children?: ReactNode }) {
  return (
    <Link className="btn-edit" to={to}>
      <IconEdit /> {children}
    </Link>
  );
}
