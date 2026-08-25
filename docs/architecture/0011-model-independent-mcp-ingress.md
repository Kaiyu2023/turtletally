# ADR 0011: Authenticate the MCP ingress by token, not by vendor

- Status: Accepted
- Date: 2026-08-25
- Amends: [ADR 0004](0004-separate-browser-and-mcp-ingress.md), [ADR 0009](0009-v1-deployment-scope.md)

## Context

ADR 0004 protects the MCP ingress with OpenAI client mTLS and validation of a
specific certificate SAN, and ADR 0009 gates the whole milestone on a ChatGPT
compatibility proof. Both were written when ChatGPT was assumed to be the only
assistant that would ever connect.

The owner intends to use more than one assistant. That makes the vendor-specific
part of the design a defect rather than a control: a certificate presented by
one vendor's egress is a property of that vendor's infrastructure, not of the
protocol, so a client that does not present one cannot connect at all. The
ingress would exclude clients rather than authenticate them, and the gate that
decides whether MCP ships at all would depend on one company's approval.

The protocol already defines how a client authenticates: OAuth 2.1 bearer
tokens, protected-resource metadata a client can discover from a `401`, and a
resource indicator that binds a token to the service it was issued for. A client
that implements the specification can connect without the server knowing
anything about it.

## Decision

Keep everything ADR 0004 decided about separation: a distinct ingress, a
dedicated runtime role, no reuse of the browser's client, session, origin, or
permissions, a stateless handler, and bounded action-specific tools. Keep
ADR 0005's preview and commit for every mutation, which is model-independent by
construction.

Replace the vendor-specific authentication with the protocol's own:

- Serve one Streamable HTTP endpoint, stateless, answering with JSON.
- Publish `/.well-known/oauth-protected-resource` naming the resource, its
  authorization server, and the scope it requires.
- Answer an unauthenticated request with `401` and a `WWW-Authenticate` header
  carrying the address of that document, so a client discovers how to
  authenticate rather than being told out of band.
- Verify the token's issuer, expiry, audience, and scope on every request. The
  accepted audiences are named explicitly in configuration; there is no
  wildcard, and an empty list is a configuration error rather than an open door.
- Derive ownership from the token subject, never from a tool argument.
- Register one client per assistant, so one can be revoked without disturbing
  the other. Dynamic client registration is not offered; registration is an
  owner action.
- Accept only the host the deployment is published under, which is what stops a
  request that reached the function under another name.

Client certificates become an optional deployment control, applied when a
particular client supports them, rather than a requirement no client can be
assumed to meet. No client is required to present one.

The compatibility gate becomes client-neutral. It proves discovery,
authorization, audience and scope binding, refusal without a token, and one
read-only tool against synthetic data, with at least one client, recording which
client and version was used. It no longer depends on any single vendor.

## Consequences

- Any specification-compliant MCP client can connect, and nothing in the server
  knows or cares which model is behind it. The conversational surface stops
  being a bet on one vendor.
- The network-level control that mTLS provided is gone as a hard requirement.
  What remains is token binding to an audience and scope, a separate client per
  assistant with its own revocation, the host allowlist, gateway throttles, the
  bounded tool surface, and preview and commit. That is a deliberate trade: the
  control excluded the owner's own clients as readily as an attacker's.
- ADR 0009's sequencing concern is answered differently. The gate that could
  fail is no longer one company's approval, so proving it early costs a sandbox
  and a token rather than a paid plan and a bound domain.
- Two assistants mean two registrations, two revocation paths, and two reviews
  before live data. The manual actions register carries them.
- A future client that cannot do OAuth 2.1 is out of scope rather than a reason
  to add an adapter. Adding one remains a decision record and an owner approval.
