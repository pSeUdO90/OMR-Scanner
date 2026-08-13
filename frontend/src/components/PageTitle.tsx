import { ReactNode } from "react";
import { Icon, iconPaths } from "./Icons";

export default function PageTitle({
  icon,
  children,
  subtitle,
}: {
  icon: keyof typeof iconPaths;
  children: ReactNode;
  subtitle?: string;
}) {
  return (
    <div className="page-title">
      <span className="page-title-icon"><Icon path={iconPaths[icon]} size={22} /></span>
      <div>
        <h2>{children}</h2>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
    </div>
  );
}
