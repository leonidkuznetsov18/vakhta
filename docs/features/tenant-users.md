# Tenant users and subscription seats

Control shows the current number of active employee records plus panel accounts with a role and
sign-in credentials. It counts each panel account once, regardless of roles or scopes. Employee and
panel identities are separate seats: no reliable identity link exists, and matching by email would
silently merge distinct records. This is a current access inventory, not monthly usage or an invoice.

The Users tab shows the total, counts for workers and every shared web role, and a searchable,
paginated directory with names, emails and available avatars. Role groups can overlap; their sum
is not the seat total. Workers without a linked Telegram account still count. Blocked/terminated
employees, removed panel access and roleless accounts do not count. Platform operators and kiosks
are not tenant users. Missing databases and failed reads show unavailable counts, never zero.

Role codes come from the platform domain catalog; translated labels reuse the panel catalogs.
Role assignments remain tenant-specific and are read live. Changing the shared authorization role
catalog is an engineering change, including PostgreSQL enum migration when adding a role; this
feature does not create an independent Control role editor or alter authorization semantics.
