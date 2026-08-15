import { AnalysisField } from "../api";

const COLORS: Record<string, string> = {
  roll: "#A60E35",
  name: "#10BBC3",
  test_no: "#FEA24F",
  test_id: "#FEA24F",
  date: "#068187",
  answers: "#A5D6A7",
};

export default function SampleFieldOverlay({
  src,
  alt,
  analysis,
}: {
  src: string;
  alt: string;
  analysis: AnalysisField[];
}) {
  const regions = analysis.filter((f) => f.detected && f.region);
  return (
    <div className="sample-overlay-wrap">
      <img className="sample-preview" src={src} alt={alt} />
      {regions.map((field) => {
        const r = field.region!;
        return (
          <span
            key={field.key}
            className="sample-region"
            style={{
              left: `${r.x0 * 100}%`,
              top: `${r.y0 * 100}%`,
              width: `${Math.max(0.01, r.x1 - r.x0) * 100}%`,
              height: `${Math.max(0.01, r.y1 - r.y0) * 100}%`,
              borderColor: COLORS[field.key] || "#10BBC3",
            }}
            title={field.class || field.label}
          >
            {field.class || field.label}
          </span>
        );
      })}
    </div>
  );
}
