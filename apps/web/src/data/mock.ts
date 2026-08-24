// Options that only an in-memory implementation can honour. They are
// deliberately outside the contract module, which is the shape ADR 0008 makes
// the Rust crate conform to.
export type MockScenario = 'DEFAULT' | 'EMPTY';

export type MockSession = 'ACTIVE' | 'EXPIRED';

export interface MockApiOptions {
  latencyMs?: number;
  session?: MockSession;
}
