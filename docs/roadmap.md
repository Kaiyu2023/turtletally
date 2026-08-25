# Roadmap

Milestone vocabulary used across this repository. Written in non-identifying terms; it records what each stage delivers and what must be true before the next one starts.

## Milestone 0 — foundation (complete)

Repository, security design, and a browser draft over synthetic fixtures with an in-memory mock. No AWS resources, no backend, no real data. The domain contract is settled, tested, and recorded in decision records.

## Milestone 1 — domain in Rust (current)

The domain crate expresses the contract of ADR 0008 and proves conformance against the committed fixture vector. Still no deployed infrastructure.

Money, the calendar types, the London wall clock, import fingerprints, recurrence, the reference-list order, and every dashboard and budget aggregate are implemented and pass against the exported vector.

The use cases that sit above the domain are implemented too, against ports rather than AWS: reference entities, the ledger with its balance and rollup effects, budgets, schedules and their bounded catch-up run, and receipt grants whose stored object is checked against the checksum the client reports. An in-memory store enforces the same version conditions and single-use rules the persistent one must, so the behaviour is tested without an account.

## Milestone 2 — first AWS resources

The Terraform bootstrap root and state backend of ADR 0006, then the browser application scope of ADR 0009: CloudFront, one Lambda binary, DynamoDB, Cognito, and S3 for receipts. Requires the recorded cost ceiling, a proven state restoration, and the owner approvals listed in the manual actions register.

## Milestone 3 — scheduling and import

The scheduler worker and its trigger, then statement import. Each is a separate decision to proceed.

## Milestone 4 — MCP

The separate ingress of ADR 0004, gated on the compatibility proof. ADR 0009 requires that proof to run first as a throwaway spike against a disposable domain.

ADR 0011 makes that ingress client-independent: it authenticates with the protocol's own OAuth 2.1 bearer tokens and publishes the metadata a client discovers from a refusal, so any specification-compliant assistant can connect and the server knows nothing about which model is behind it. The binary, its tool surface, and the preview-and-commit pairs are implemented; registering a client and proving the gate remain owner actions.

## Deferred, with reasons

Work the design review identified, consciously not done, recorded here so it is a decision rather than an oversight. Each entry says what would make it worth doing.

- **Sweeping the stylesheets onto the layout tokens.** `:root` defines spacing, type-scale, z-index and breakpoint tokens, and the two values that were measurably wrong are fixed. Roughly 135 declarations still carry literals. Do this when a stylesheet is being changed for another reason, not as a sweep of its own: it is mechanical work with real regression risk and no functional payoff.
- **Branded `Month` and `LocalDate`.** The template literal types admit `'2026-1'`, which the runtime regexes then reject. Threading a parse constructor through every literal in the fixtures, tests and components costs more than the defect removes. Revisit if a malformed value ever reaches a user, or when the Rust crate needs the same guarantee at its boundary.
- **Splitting language from currency and timezone.** Governed by the evolution rule in the user preferences API document, which requires their product semantics to be defined first. A single `AppLocale` currently drives all three.
- **The MCP client compatibility spike.** ADR 0009 moves it ahead of irreversible spend, and ADR 0011 makes it client-neutral. Running it is an owner action against a sandbox account and a disposable domain.

## Not scheduled

Multi-currency, multiple owners, and mobile applications are out of scope. Adding any of them is a new decision record, not a milestone.
