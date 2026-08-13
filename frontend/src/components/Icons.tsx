export function Icon({ path, size = 18 }: { path: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={path} />
    </svg>
  );
}

export const iconPaths = {
  dashboard: "M4 4h7v7H4V4Zm9 0h7v5h-7V4ZM4 13h7v7H4v-7Zm9 3h7v4h-7v-4Z",
  students: "M16 11a3 3 0 1 0-6 0 3 3 0 0 0 6 0ZM4 19a6 6 0 0 1 12 0M17 8a3 3 0 1 1 0 6M20.5 19a5 5 0 0 0-4-4.7",
  subjects: "M5 4h10a2 2 0 0 1 2 2v14H7a2 2 0 0 0-2 2V4Zm0 0v16M9 8h6M9 12h6",
  layouts: "M4 5h16v14H4V5Zm0 4h16M10 9v10",
  exams: "M8 3h8v3H8V3ZM6 6h12v15H6V6Zm4 5h4M10 14h4",
  evaluation: "M5 12l4 4 10-10M5 19h14",
  results: "M5 19V9m7 10V5m7 14v-7",
  search: "M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16Zm10 2-4.3-4.3",
  upload: "M12 16V5m0 0 4 4M12 5 8 9M5 19h14",
  download: "M12 5v11m0 0 4-4m-4 4-4-4M5 19h14",
  key: "M8 14a4 4 0 1 1 3.5-6H21v3h-2v2h-2v2h-3.5A4 4 0 0 1 8 14Z",
  calendar: "M7 4v3M17 4v3M4 9h16M6 5h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z",
  published: "M12 3l2.2 4.6L19 8.2l-3.5 3.4.8 4.8L12 14.8 7.7 16.4l.8-4.8L5 8.2l4.8-.6L12 3Z",
  draft: "M5 19h14M7 16V8l5-3 5 3v8",
  sheet: "M7 3h8l4 4v14H7V3Zm8 0v4h4M10 12h6M10 16h6",
};

export function NavIcon({ name }: { name: keyof typeof iconPaths }) {
  return <Icon path={iconPaths[name]} />;
}
