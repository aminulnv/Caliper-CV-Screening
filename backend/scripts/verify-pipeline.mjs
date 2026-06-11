import 'dotenv/config';
import { getRecruiteeCredentials } from '../dist/services/workspace.js';
import { fetchRecruiteeApplicants, fetchRecruiteeJobs } from '../dist/services/recruitee.js';

const WORKSPACE = process.env.DEFAULT_WORKSPACE_ID ?? 'a0000000-0000-0000-0000-000000000001';
const jobArg = process.argv[2];

const creds = await getRecruiteeCredentials(WORKSPACE);
const jobs = await fetchRecruiteeJobs(creds.baseUrl, creds.apiKey);
const target =
  (jobArg && jobs.find((j) => j.id === jobArg || j.title.toLowerCase().includes(jobArg.toLowerCase())))
  ?? jobs.find((j) => j.title.toLowerCase().includes('procurement manager'))
  ?? jobs[0];

if (!target) {
  console.error('No jobs found');
  process.exit(1);
}

console.log(`Verifying pipeline for: ${target.title} (${target.id})`);
const data = await fetchRecruiteeApplicants(creds.baseUrl, creds.apiKey, target.id);

console.log('Stages:', data.pipeline.stages.map((s) => s.name).join(' → '));
console.log('Stage count:', data.pipeline.stages.length);
console.log('Qualified:', data.qualified_count);
console.log('Disqualified:', data.disqualified_count);
console.log('Applicants loaded:', data.applicants.length);

const byStage = new Map();
for (const a of data.applicants) {
  const key = a.stage_name ?? 'unknown';
  byStage.set(key, (byStage.get(key) ?? 0) + 1);
}
console.log('Applicants by stage:', Object.fromEntries(byStage));

const disqSample = data.applicants.filter((a) => a.disqualified).slice(0, 3);
console.log('Disqualified samples:', disqSample.map((a) => ({
  name: a.name,
  stage: a.stage_name,
  reason: a.disqualify_reason,
})));

const emptyStages = data.pipeline.stages.filter(
  (s) => !data.applicants.some((a) => a.stage_id === s.id),
);
console.log('Empty stages (expected in UI):', emptyStages.map((s) => s.name).join(', ') || '(none)');
