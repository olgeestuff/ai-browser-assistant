// Direct Google Sheets/Drive REST calls, authenticated via chrome.identity.
// Deliberately skips the "Apps Script Web App as middleman" approach from
// the requirements doc's default suggestion: chrome.identity.getAuthToken
// gives an OAuth token scoped to just this extension and these two scopes,
// with no public, unauthenticated write endpoint to secure (OD-07, AC-10).
// See README "Google Cloud setup" for the one-time OAuth client you must
// create yourself (client_id is tied to your own Google account/project —
// nobody else can create it for you).

import type { TaskRecord } from "./types";

const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3/files";

export class GoogleAuthError extends Error {}

export async function getAuthToken(interactive: boolean): Promise<string> {
  try {
    const token = await chrome.identity.getAuthToken({ interactive });
    if (!token || typeof token !== "string") {
      throw new GoogleAuthError("No token returned. Is the OAuth client configured in manifest.json?");
    }
    return token;
  } catch (e) {
    throw new GoogleAuthError(`Google sign-in failed: ${(e as Error).message}`);
  }
}

async function sheetsFetch(path: string, token: string, init: RequestInit): Promise<Response> {
  return fetch(`${SHEETS_API}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
  });
}

const TASK_SHEET_TAB = "Tasks";
const TASK_HEADER = [
  "task_id",
  "created_at",
  "instruction",
  "tab_url",
  "status",
  "result_summary",
  "error_code",
  "started_at",
  "completed_at",
];

/** Ensures the "Tasks" tab exists with the header row from the data model (idempotent, cheap). */
export async function ensureTasksSheet(sheetId: string, token: string): Promise<void> {
  const metaResp = await sheetsFetch(`/${sheetId}?fields=sheets.properties.title`, token, { method: "GET" });
  if (!metaResp.ok) throw new Error(`Could not read spreadsheet metadata (${metaResp.status}).`);
  const meta = await metaResp.json();
  const titles: string[] = (meta.sheets ?? []).map((s: any) => s.properties.title);

  if (!titles.includes(TASK_SHEET_TAB)) {
    const addResp = await sheetsFetch(`/${sheetId}:batchUpdate`, token, {
      method: "POST",
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title: TASK_SHEET_TAB } } }] }),
    });
    if (!addResp.ok) throw new Error(`Could not create "${TASK_SHEET_TAB}" tab (${addResp.status}).`);
  }

  await sheetsFetch(`/${sheetId}/values/${TASK_SHEET_TAB}!A1:I1?valueInputOption=RAW`, token, {
    method: "PUT",
    body: JSON.stringify({ values: [TASK_HEADER] }),
  });
}

/** Appends one row per task write. Only summaries are stored by default (OD-04 privacy-first default) — never full page text. */
export async function appendTaskRow(sheetId: string, token: string, task: TaskRecord): Promise<void> {
  const row = [
    task.taskId,
    task.createdAt,
    task.instruction,
    task.tabUrl,
    task.status,
    task.resultSummary ?? "",
    task.errorCode ?? "",
    task.startedAt ?? "",
    task.completedAt ?? "",
  ];
  const resp = await sheetsFetch(
    `/${sheetId}/values/${TASK_SHEET_TAB}!A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    token,
    { method: "POST", body: JSON.stringify({ values: [row] }) }
  );
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Failed to append task row (${resp.status}): ${text.slice(0, 200)}`);
  }
}

const FILES_SHEET_TAB = "Files";
const FILES_HEADER = ["file_id", "task_id", "drive_file_id", "file_name", "mime_type", "drive_url", "created_at"];

export async function ensureFilesSheet(sheetId: string, token: string): Promise<void> {
  const metaResp = await sheetsFetch(`/${sheetId}?fields=sheets.properties.title`, token, { method: "GET" });
  if (!metaResp.ok) throw new Error(`Could not read spreadsheet metadata (${metaResp.status}).`);
  const meta = await metaResp.json();
  const titles: string[] = (meta.sheets ?? []).map((s: any) => s.properties.title);

  if (!titles.includes(FILES_SHEET_TAB)) {
    const addResp = await sheetsFetch(`/${sheetId}:batchUpdate`, token, {
      method: "POST",
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title: FILES_SHEET_TAB } } }] }),
    });
    if (!addResp.ok) throw new Error(`Could not create "${FILES_SHEET_TAB}" tab (${addResp.status}).`);
  }

  await sheetsFetch(`/${sheetId}/values/${FILES_SHEET_TAB}!A1:G1?valueInputOption=RAW`, token, {
    method: "PUT",
    body: JSON.stringify({ values: [FILES_HEADER] }),
  });
}

export async function appendFileRow(
  sheetId: string,
  token: string,
  row: { fileId: string; taskId: string; driveFileId: string; fileName: string; mimeType: string; driveUrl: string }
): Promise<void> {
  const values = [
    [row.fileId, row.taskId, row.driveFileId, row.fileName, row.mimeType, row.driveUrl, new Date().toISOString()],
  ];
  const resp = await sheetsFetch(
    `/${sheetId}/values/${FILES_SHEET_TAB}!A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    token,
    { method: "POST", body: JSON.stringify({ values }) }
  );
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Failed to append file row (${resp.status}): ${text.slice(0, 200)}`);
  }
}

export interface DriveUploadResult {
  fileId: string;
  name: string;
  mimeType: string;
  webViewLink: string;
}

/** Uploads one file (e.g. a screenshot data URL converted to a Blob) into the configured Drive folder. */
export async function uploadFileToDrive(
  token: string,
  folderId: string,
  fileName: string,
  mimeType: string,
  blob: Blob
): Promise<DriveUploadResult> {
  const metadata = { name: fileName, mimeType, parents: folderId ? [folderId] : undefined };
  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
  form.append("file", blob, fileName);

  const resp = await fetch(`${DRIVE_UPLOAD_API}?uploadType=multipart&fields=id,name,mimeType,webViewLink`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: form,
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Drive upload failed (${resp.status}): ${text.slice(0, 200)}`);
  }
  const json = await resp.json();
  return { fileId: json.id, name: json.name, mimeType: json.mimeType, webViewLink: json.webViewLink };
}
