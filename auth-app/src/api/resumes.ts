import type { ResumeReading, ResumeRequest } from "../resumeSheet";
import { api, LONG_REQUEST_TIMEOUT_MS } from "./client";

/**
 * Resumes the recruiter attached, read into people over the API (server: modules/candidates/resume-read.ts). Reading changes
 * nothing; it says who is in the files and what adding them would do. The people it names then go to the one import the sheets
 * and the Candidates page also use, a batch at a time (api/peopleSheet.ts), which is why adding twice adds nobody twice.
 */
export const resumeApi = {
  /** Up to ten files at once, read by the assistant in one go. What it read before can be sent back so it is not read again. */
  read: (request: ResumeRequest, signal?: AbortSignal) =>
    api<ResumeReading>("POST", "/v1/candidates/resumes/read", request, {
      timeoutMs: LONG_REQUEST_TIMEOUT_MS,
      ...(signal ? { signal } : {}),
    }),
};
