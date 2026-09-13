# Employee communications

Authorized masters, production heads, HR and administrators can send private Telegram messages to
one employee or a reviewed group from any panel page. The header and sidebar both open the same
communications workspace. Desktop uses one 640px, viewport-bounded, non-modal Sheet; mobile uses
the full screen. There is no dimming or width toggle. Close (X), Escape or clicking outside closes
the panel while retaining its draft.

## Compose and return to work

An autocomplete combobox finds recipients by name/personnel number, with optional site, unit and
team filters. Use arrows and Enter to choose employees; selected employees have removable chips.
Escape first closes suggestions. Search requests are debounced and superseded requests are canceled. Selection
survives pagination and filtering. Select all results selects the entire eligible matching audience,
up to 500 people. Inactive employees and employees without Telegram remain visibly unavailable.

A single text message sends directly. A group or questionnaire opens an inline review first.
Closing preserves the draft across internal navigation; opening a different employee context asks
whether to keep or replace an existing draft. Drafts are local to the signed-in tab and disappear on
reload or logout. They are not cross-device drafts.

Attach up to five files, each up to 10 MiB: JPEG/PNG/WebP images, MP4 video, MP3 audio or PDF documents.
Images are normalized; files are privately stored and checked before admission. Upload failures retain
retry/remove actions. Unsupported or malformed files cannot enter a communication.

## Questionnaires

A questionnaire contains 1–10 ordered questions. Each can accept free text, one choice or multiple
choices and can be required or optional. Free answers are limited to 2000 characters. Questionnaire
content is immutable after sending.

The worker opens an invitation inside Telegram, sees that the questionnaire is named and that its
author can see the answers, then answers one question at a time. Back, next and save-and-pause preserve
progress on the server. A final review precedes submission; submitted responses are read-only.
Ordinary Telegram text replies do not enter this workspace or interfere with operational bot forms.

The author sees invited, Telegram-accepted, started and submitted counts separately, with individual
answers and choice summaries. Choice percentages use submitted people who answered that question;
multiple selections may total above 100%. Partial drafts remain explicitly distinct from submissions.
Closing a questionnaire stops further submissions while preserving recorded evidence.

## Delivery and access

The sent history records immutable content, recipients, files and ordered part statuses. Queue
acceptance and Telegram acceptance are distinct; neither proves that an employee read the message.
A confirmed successful part is not intentionally resent. Unknown outcomes need an explicit retry
with a duplicate-delivery warning. Relinking an employee's Telegram or losing authority cancels
remaining eligible work; an already in-flight external send cannot be recalled.

History and results belong to their author and require current scope over the whole audience.
Communications do not change attendance, shift state, bonus or employee performance records.

Technical specification, checks and rollout limits:
[engineering memory](../engineering/features/employee-communications.md).
