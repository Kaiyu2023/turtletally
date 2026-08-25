import { createHttpApi } from '../data/httpApi';
import { createMockApi } from '../data/mockApi';
import type { MockScenario, MockSession } from '../data/mock';
import type { FinanceApi } from '../data/types';
import { cacheReferenceLists } from './referenceCache';

// A build that names an API base talks to the deployed server; a build without
// one is the browser draft over its in-memory mock. Nothing decides this at
// runtime, so a draft build cannot reach a real ledger by accident.
export function createApiFromLocation(search: string, apiBase = import.meta.env.VITE_API_BASE): FinanceApi {
  if (apiBase) {
    return cacheReferenceLists(createHttpApi(apiBase));
  }

  const params = new URLSearchParams(search);
  const scenario: MockScenario = params.get('scenario') === 'empty' ? 'EMPTY' : 'DEFAULT';
  const session: MockSession = params.get('session') === 'expired' ? 'EXPIRED' : 'ACTIVE';
  const requestedLatency = Number(params.get('latency'));
  const options =
    Number.isFinite(requestedLatency) && requestedLatency >= 0 && params.has('latency')
      ? { latencyMs: requestedLatency, session }
      : { session };

  return cacheReferenceLists(createMockApi(scenario, options));
}
