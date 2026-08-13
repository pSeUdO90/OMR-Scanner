const json = async (res: Response) => {
  const text = await res.text();
  let data: unknown = text;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = text;
  }
  if (!res.ok) {
    const detail = typeof data === "object" && data && "detail" in data ? (data as { detail: unknown }).detail : null;
    throw new Error(typeof detail === "string" ? detail : text || res.statusText);
  }
  return data;
};

export const api = {
  get: (path: string) => fetch(path).then(json),
  post: (path: string, body?: unknown) =>
    fetch(path, {
      method: "POST",
      headers: body instanceof FormData ? undefined : { "Content-Type": "application/json" },
      body: body instanceof FormData ? body : JSON.stringify(body ?? {}),
    }).then(json),
  put: (path: string, body: unknown) =>
    fetch(path, {
      method: "PUT",
      headers: body instanceof FormData ? undefined : { "Content-Type": "application/json" },
      body: body instanceof FormData ? body : JSON.stringify(body),
    }).then(json),
  del: (path: string) => fetch(path, { method: "DELETE" }).then(json),
};

export type Student = {
  id: number;
  roll_no: string;
  name: string;
  gender: string;
  class_name: string;
  section: string;
  session: string;
};

export type Subject = { id: number; name: string; code: string };

export type AnalysisField = {
  key: string;
  label: string;
  detected: boolean;
  detail: string;
  value: string;
  mappable: boolean;
};

export type Layout = {
  id: number;
  slug: string;
  name: string;
  description: string;
  total_questions: number;
  options: string;
  is_builtin?: boolean;
  has_sample?: boolean;
  field_map?: Record<string, string>;
  analysis?: AnalysisField[];
  preview?: { default_maps: { subject: string; start_q: number; end_q: number }[] };
};

export type Exam = {
  id: number;
  name: string;
  exam_date: string;
  exam_type: string;
  duration_minutes: number;
  correct_marks: number;
  wrong_marks: number;
  unattempted_marks: number;
  layout_id: number;
  layout_name: string;
  total_questions?: number;
  status: string;
  subject_maps: { id: number; subject_id: number; start_q: number; end_q: number; subject_name: string }[];
  answer_key: Record<string, string>;
  sheet_count: number;
  evaluated_count: number;
  has_sample?: boolean;
  test_id?: string;
  test_no?: string;
  field_map?: Record<string, string>;
  analysis?: AnalysisField[];
};

export const FIELD_TARGETS = [
  { value: "", label: "Ignore" },
  { value: "exam_date", label: "Exam Date" },
  { value: "test_id", label: "Test ID" },
  { value: "test_no", label: "Test No" },
];
