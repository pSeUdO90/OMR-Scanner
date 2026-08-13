const json = async (res: Response) => {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json();
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
    fetch(path, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(json),
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
export type Layout = {
  id: number;
  slug: string;
  name: string;
  description: string;
  total_questions: number;
  options: string;
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
  status: string;
  subject_maps: { id: number; subject_id: number; start_q: number; end_q: number; subject_name: string }[];
  answer_key: Record<string, string>;
  sheet_count: number;
  evaluated_count: number;
};
