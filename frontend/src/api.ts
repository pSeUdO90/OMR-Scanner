import type { DataBlock } from "./blockKinds";
import { showToast } from "./components/ToastProvider";

export type { DataBlock };
export { BLOCK_KINDS, FIELD_TARGETS } from "./blockKinds";

const TOKEN_KEY = "omr_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

export function setToken(token: string) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
    document.cookie = `omr_token=${encodeURIComponent(token)}; path=/; SameSite=Lax`;
  } else {
    localStorage.removeItem(TOKEN_KEY);
    document.cookie = "omr_token=; path=/; max-age=0; SameSite=Lax";
  }
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  document.cookie = "omr_token=; path=/; max-age=0; SameSite=Lax";
}

export function authFileUrl(path: string) {
  const token = getToken();
  if (!token) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}token=${encodeURIComponent(token)}`;
}

const json = async (res: Response) => {
  const text = await res.text();
  let data: unknown = text;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = text;
  }
  if (res.status === 401 && !res.url.includes("/api/auth/login")) {
    clearToken();
  }
  if (!res.ok) {
    const detail = typeof data === "object" && data && "detail" in data ? (data as { detail: unknown }).detail : null;
    const message = typeof detail === "string" ? detail : text || res.statusText;
    if (!res.url.includes("/api/settings/folders")) {
      showToast("error", message);
    }
    throw new Error(message);
  }
  return data;
};

const skipSuccessToast = (path: string) =>
  path.includes("/api/auth/login") ||
  path.includes("/api/auth/logout") ||
  path.includes("/api/auth/me") ||
  path.includes("/import/preview");

const toastSuccess = (path: string, fallback: string) => {
  if (skipSuccessToast(path)) return;
  if (path.includes("/reset-password")) {
    showToast("ok", "Password reset to 123456");
    return;
  }
  if (path.includes("/auth/password")) {
    showToast("ok", "Password updated");
    return;
  }
  showToast("ok", fallback);
};

const headersFor = (body?: unknown) => {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined && !(body instanceof FormData)) headers["Content-Type"] = "application/json";
  return headers;
};

export const api = {
  get: (path: string) => fetch(path, { headers: headersFor() }).then(json),
  post: (path: string, body?: unknown) =>
    fetch(path, {
      method: "POST",
      headers: headersFor(body),
      body: body instanceof FormData ? body : JSON.stringify(body ?? {}),
    }).then(json).then((data) => {
      toastSuccess(path, "Task completed");
      return data;
    }),
  put: (path: string, body: unknown) =>
    fetch(path, {
      method: "PUT",
      headers: headersFor(body),
      body: body instanceof FormData ? body : JSON.stringify(body),
    }).then(json).then((data) => {
      toastSuccess(path, "Task completed");
      return data;
    }),
  del: (path: string) =>
    fetch(path, { method: "DELETE", headers: headersFor() }).then(json).then((data) => {
      toastSuccess(path, "Task completed");
      return data;
    }),
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
  class?: string;
  detected: boolean;
  detail: string;
  value: string;
  mappable: boolean;
  region?: { x0: number; y0: number; x1: number; y1: number } | null;
};

export type Layout = {
  id: number;
  slug: string;
  name: string;
  description: string;
  total_questions: number;
  options: string;
  is_builtin?: boolean;
  is_studio?: boolean;
  is_finalized?: boolean;
  in_use?: boolean;
  sample_rev?: number;
  has_sample?: boolean;
  studio_config?: Record<string, unknown>;
  studio_geometry?: Record<string, unknown>;
  studio_blocks?: unknown[];
  field_map?: Record<string, string>;
  blocks?: DataBlock[];
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
  class_name?: string;
  section?: string;
  batch?: string;
  grace_questions?: number[];
  field_map?: Record<string, string>;
  analysis?: AnalysisField[];
};
