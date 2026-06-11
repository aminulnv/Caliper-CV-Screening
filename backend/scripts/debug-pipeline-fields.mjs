import 'dotenv/config';
import { getRecruiteeCredentials } from '../dist/services/workspace.js';
import { parseRecruiteeConfig, resolveNumericCompanyId } from '../dist/services/recruitee.js';

const WORKSPACE = process.env.DEFAULT_WORKSPACE_ID ?? 'a0000000-0000-0000-0000-000000000001';
const JOB_ID = process.argv[2] ?? '11062026-mc8zce4o';

const creds = await getRecruiteeCredentials(WORKSPACE);
const { apiRoot } = parseRecruiteeConfig(creds.baseUrl);
const numericId = await resolveNumericCompanyId(creds.baseUrl, creds.apiKey);
const candidateRoot = `https://api.recruitee.com/c/${numericId}`;

async function get(path) {
  const res = await fetch(`${apiRoot}${path}`, {
    headers: { Authorization: `Bearer ${creds.apiKey}` },
  });
  return res.json();
}

const offer = await get(`/offers/${JOB_ID}`);
const stages = offer.offer?.pipeline_template?.stages ?? [];
console.log('STAGES sample:', JSON.stringify(stages.slice(0, 3), null, 2));
console.log('STAGE keys:', stages[0] ? Object.keys(stages[0]) : []);

const list = await fetch(`${candidateRoot}/candidates?offer_id=${JOB_ID}&limit=5&disqualified=true`, {
  headers: { Authorization: `Bearer ${creds.apiKey}` },
}).then((r) => r.json());

const disq = list.candidates?.[0];
if (disq) {
  const placement = disq.placements?.find((p) => String(p.offer_id) === String(JOB_ID));
  console.log('DISQ placement keys:', placement ? Object.keys(placement) : []);
  console.log('DISQ placement:', JSON.stringify(placement, null, 2));
}

const qual = await fetch(`${candidateRoot}/candidates?offer_id=${JOB_ID}&limit=1&qualified=true`, {
  headers: { Authorization: `Bearer ${creds.apiKey}` },
}).then((r) => r.json());
const q = qual.candidates?.[0];
if (q?.id) {
  const detail = await fetch(`${candidateRoot}/candidates/${q.id}`, {
    headers: { Authorization: `Bearer ${creds.apiKey}` },
  }).then((r) => r.json());
  const p = detail.candidate?.placements?.find((pl) => String(pl.offer_id) === String(JOB_ID));
  console.log('QUAL placement:', JSON.stringify(p, null, 2));
  console.log('QUAL candidate keys:', Object.keys(detail.candidate ?? {}).slice(0, 20));
}
