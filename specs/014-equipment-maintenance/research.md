# Research: Equipment maintenance

**Change**: 014-equipment-maintenance | **Created**: 2026-09-24 | **Spec**: [spec.md](spec.md)

This note records the external inputs of the specification: the customer's maintenance
requirements document, how manufacturer manuals are sourced, and what the first delivery takes
from each. It is not a second copy of the requirements; `spec.md` owns them.

## R1. Customer document "ТЗ обслуживание и ремонт оборудования" v1.3

Source: `TZ_obsluzhivanie_i_remont_oborudovaniya.docx`, version 1.3 of 2026-09-22, supplied by the
owner on 2026-09-24 (SHA-256 of the file received:
`cda2c7692b3de1faac8f98e2b4b9257e7a977e51219fca8edca5176241c9fb90`). It is written in Russian and
references its own sections as "TZ-M §N" in these artifacts to avoid confusion with the main
"ТЗ MVP v1.0" (spec N.N). The document is not committed to the repository.

The document describes a complete CMMS: zones and duty rosters, a permission matrix with
qualifications, a shop-floor board, equipment cards with nodes and installed parts, emergency
reports, routing and reaction SLAs, a seven-status work order, planned maintenance with a plan
builder, checklists with 54 parameters, a warehouse with reserve/issue/return, purchasing,
calendar windows versus actual downtime, meter hours with epochs, reports, a spare-part catalogue
and photo/OCR part recognition. It proposes five delivery stages (TZ-M §34): foundation, emergency,
maintenance and calendar, spare parts, reports and pilot.

The owner's request of 2026-09-24 is narrower: an equipment registry, attached manufacturer
manuals, planned maintenance derived from the manual, a calendar, one responsible mechanic per
machine, the materials needed for each maintenance, Telegram reminders 7, 3 and 1 day before, and
an emergency maintenance scenario. This change covers that request and adopts the document's rules
wherever they apply to it, so later stages extend the model instead of replacing it.

| TZ-M section                                | This change                                                                                                                                                                                                                      |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R01–R10 unchangeable rules                  | Adopted where applicable: personal responsibility (R01), one open stop per machine (R02), independent machine state and work status (R03), notification ≠ acceptance (R04), no silent resets (R07), versioned history (R08, R10) |
| §2 roles                                    | Mechanic (executor), chief mechanic (plans, acceptance, release), operator (existing worker), master (existing `SHIFT_MASTER`)                                                                                                   |
| §3 zones and duty                           | Reuses existing sites, units and zones; no new duty roster (reserve = backup mechanic, then the unit master)                                                                                                                     |
| §4 permission matrix                        | Reduced to the actions of this change; scope via existing `web_user_roles`                                                                                                                                                       |
| §6–7 shop-floor board                       | Equipment list with state, next maintenance and active work; no real-time board redesign                                                                                                                                         |
| §8 equipment card                           | Passport, manuals, plans, history; nodes/positions deferred                                                                                                                                                                      |
| §10–13 bot, report, routing, notifications  | Emergency report on a machine, routing to the responsible mechanic, acknowledge SLA and escalation                                                                                                                               |
| §14–15 work order states                    | Adopted in reduced form (see spec Key Entities)                                                                                                                                                                                  |
| §16 repair and return to service            | Release to service as a separate action by the chief mechanic or master                                                                                                                                                          |
| §18–19 planned maintenance                  | Calendar-interval plans, one job per cycle, versioned plans; meter-hour plans depend on decision D-1                                                                                                                             |
| §20 checklists                              | Operation list per plan with done / not done / not applicable and a reason; numeric measurements deferred                                                                                                                        |
| §21–22, §39–51 parts, warehouse, purchasing | Deferred. This change stores a required-materials list and a readiness answer from the mechanic, no stock quantities                                                                                                             |
| §23 calendar and downtime                   | Maintenance calendar; actual equipment stop episodes recorded from emergency reports                                                                                                                                             |
| §24 meter hours                             | Depends on decision D-1                                                                                                                                                                                                          |
| §25 reports                                 | On-time maintenance and emergency response metrics only                                                                                                                                                                          |
| §52–62 catalogue and photo recognition      | Deferred                                                                                                                                                                                                                         |

Deferred sections are later bounded changes after this one is accepted in the pilot; they are
listed in `spec.md` Non-goals.

## R2. Where maintenance intervals come from

Manufacturer operating manuals ("руководство по эксплуатации", "operator's manual", "service
manual") state maintenance as a table of operations against an interval. Observed interval forms:

- Calendar: daily, weekly, monthly, every 3/6/12 months.
- Operating hours: every 50/250/500/1,000/2,000 h, often with "or N months, whichever comes first".
- Shift or cycle based: "every shift", "every 100,000 strokes" (presses).
- Condition based: "when the indicator shows", "if contaminated".

Each operation names what to do (inspect, clean, lubricate, replace, adjust, check) and often the
material: lubricant grade and volume, filter part number, belt designation. This is why a plan in
this change holds operations and a materials list, and why the source (document, edition, page or
section) is stored with every plan (TZ-M §18: the interval comes from the manual of the specific
machine or an approved decision of the plant; AI does not set norms).

Daily and per-shift operator care ("autonomous maintenance") is the existing zone checklist
territory, not a mechanic's planned maintenance. The spec keeps them apart.

## R3. Obtaining manuals

"We find the manual on the internet, download it and attach it to the machine" is a human
onboarding task, not an automated product function:

1. Identify manufacturer, model and serial number from the machine nameplate.
2. Search the manufacturer's official site or service portal first; use a distributor or a
   manual archive only when the manufacturer does not publish it, and record that.
3. Download the PDF, check that model and edition match the machine, and upload it to the machine
   with the source URL, the edition/year and the language.
4. Read the maintenance table and create the plans with a reference to the page or section.

The product stores the file, the source URL and who attached it. It never fetches files from a URL
on its own, because server-side fetching of arbitrary URLs is an SSRF risk and a licence question;
the person uploading confirms the file may be used internally. Manuals are internal reference
copies for the plant's own staff. A one-time assisted search for the pilot machine list (an agent
searching and proposing links for a human to verify) can be done outside the product once the
owner provides the list of machines; it does not change the product scope.

## R4. Reference products (patterns only)

Common CMMS patterns that match the request and TZ-M: one asset register with documents attached to
the asset; preventive maintenance schedules generating one work order per occurrence; a calendar of
due work orders; lead-time notifications before the due date; emergency work orders created from a
breakdown request with a priority and an assignee; a parts list per procedure. This change takes
these patterns and nothing product-specific.
