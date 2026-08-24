import { createMockApi } from '../data/mockApi';
import type { MockFinanceApi, MockScenario, MockSession } from '../data/types';

export function createApiFromLocation(search: string): MockFinanceApi {
  const params = new URLSearchParams(search);
  const scenario: MockScenario = params.get('scenario') === 'empty' ? 'EMPTY' : 'DEFAULT';
  const session: MockSession = params.get('session') === 'expired' ? 'EXPIRED' : 'ACTIVE';
  const requestedLatency = Number(params.get('latency'));
  const options =
    Number.isFinite(requestedLatency) && requestedLatency >= 0 && params.has('latency')
      ? { latencyMs: requestedLatency, session }
      : { session };

  return createMockApi(scenario, options);
}
