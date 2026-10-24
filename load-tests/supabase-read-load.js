import http from 'k6/http';
import { check } from 'k6';

const baseUrl = __ENV.SUPABASE_URL;
const anonKey = __ENV.SUPABASE_ANON_KEY;
const accessToken = __ENV.SUPABASE_TEST_JWT;

export const options = {
  scenarios: {
    rush_hour_read_load: {
      executor: 'constant-arrival-rate',
      rate: Number(__ENV.RATE || 500),
      timeUnit: '1s',
      duration: __ENV.DURATION || '2m',
      preAllocatedVUs: Number(__ENV.PRE_ALLOCATED_VUS || 200),
      maxVUs: Number(__ENV.MAX_VUS || 1000),
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1000'],
  },
};

export default function () {
  if (!baseUrl || !anonKey || !accessToken) throw new Error('Set SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_TEST_JWT.');
  const response = http.get(`${baseUrl}/rest/v1/vehicles?select=id,route_id,is_active&is_active=eq.true&limit=100`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` },
    tags: { endpoint: 'active-vehicles' },
  });
  check(response, { 'active vehicle list returns 200': (r) => r.status === 200 });
}
