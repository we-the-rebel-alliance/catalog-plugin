# Security

## What leaves the machine

Nothing. The catalog talks to no provider and names no URL. It reads the installed packages' `package.json` manifests
from the local disk, reads the installed plugins' own `status` answers, and brokers calls between OpenCode plugins on the
same host. There is no network call.

## Credentials

The catalog holds no credential and signs in to nothing. A broker request carries a **target plugin's action grant** for
one commit: the catalog passes the compact token through and keeps no copy, and neither status nor logs ever carry it. The
grant is a bearer capability until it expires, so it is not logged.

## Grants and confirmation

The catalog never verifies a grant. It forwards the token to the target plugin, whose `register` checks the trusted key,
the signature, the audience, consumer, capability, action, account, manifest hash, input digest, lifetime, confirmation
and single use, and spends the plan. A refused grant is the target's `GRANT_INVALID`.

The catalog may only **narrow** access. A **grant** is the person's durable configuration (`options.grants`), never
something a request supplies: the catalog looks the consumer's grant up, and the request can only narrow its scope.

- the grant must name the source or action, the resolved account and the installed manifest hash, and its scope must
  cover the request; an ungranted consumer, another consumer's grant, another account, another manifest or a wider scope
  is `PERMISSION_DENIED`, and a disabled grant is `SOURCE_DISABLED`;
- the source's method and its declared operations are allowed for the granted account, and everything else is denied —
  the fence is built by the contract's `access` module from the grant;
- the account alias must be one the target's own status lists;
- `broker_act_commit` is class `write` with `effect: ask`, so it always asks the person before it forwards, and under
  `access: read-only` it is off even with a valid grant;
- the target plugin's own `access` setting is final on top of all of this, with one known contract issue: a target
  method-level `deny` on a read is overridden by a fenced read until plugin-contract#76 is fixed. The catalog's docs and
  the README state that limit; the fix belongs to the contract.

An `allow` rule in the caller's session is not a confirmation: a non-read RPC call without an answered ask is refused
with `PERMISSION_DENIED` by the contract's `register`. The catalog's commit asks in the calling session; an app answers
that ask as an OpenCode client. The session must name an agent the location has, because the contract's register refuses
a session that names none.

## Untrusted data

Every manifest and every status answer is data from an installed package: the listing is marked `trust: "untrusted"`,
and the target's own answer keeps its mark. The catalog never follows text from a manifest or a status as an instruction,
and never uses it to pick a method, an account or a recipient.

## Redaction

A status the catalog relays as refused goes through `describeError`, which keeps a contract code, replaces URL query
values, bearer credentials, JWTs and token-shaped words, and cuts the line to 160 characters. Status and logs never carry
a credential or a URL query string.

## Reporting

Report a vulnerability through GitHub's private vulnerability reporting on this repository. Do not open a public issue
with a credential, a token or a person's data in it.
