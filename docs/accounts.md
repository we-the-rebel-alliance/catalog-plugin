# Accounts

The catalog signs in to nothing. It declares no `accounts` block, offers no `probe` method, and takes no `account` on
its own methods.

A broker request may name an **account**, and that alias is the *target plugin's*: the catalog resolves it against
the target's own `status.accounts` before it opens a fenced session. One alias may be omitted; a target with several
makes it required, and an alias the target does not serve is `ACCOUNT_UNKNOWN`.

The alias never reaches the catalog's own gate. Its methods are declared `accounts: "none"`, so an `account` key at
the top of a method's input is `INPUT_INVALID`; the target's alias travels inside the broker request, where the target
plugin's account machinery reads it.
