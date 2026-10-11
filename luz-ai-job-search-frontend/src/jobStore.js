import { initialJobs } from "./jobData.js";

export const JOB_STORAGE_KEY = "guangqi-campus-applications-v1";

export function loadStoredJobs() {
  try {
    const saved = window.localStorage.getItem(JOB_STORAGE_KEY);
    if (!saved) {
      return initialJobs;
    }

    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed : initialJobs;
  } catch {
    return initialJobs;
  }
}

export function saveStoredJobs(jobs) {
  window.localStorage.setItem(JOB_STORAGE_KEY, JSON.stringify(jobs));
}

export async function fetchApplicationJobs() {
  return loadStoredJobs();
}

export async function persistApplicationJobs(jobs) {
  saveStoredJobs(jobs);
  return jobs;
}
