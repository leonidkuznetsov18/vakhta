# Pilot equipment: NEWTOP paper cup line

**Change**: 014-equipment-maintenance | **Created**: 2026-09-24 | **Spec**: [spec.md](spec.md)

The owner named three machines for the first register entries (2026-09-24): NEWTOP-FB100S and
NEWTOP-FB158S (paper cup machines) and NEWTOP-FB118Dt (listed as a paper cup machine). This note
records what public sources say about them and drafts their maintenance plans in the structure of
FR-020, so the chief mechanic can confirm them on site. It is onboarding input, not product
behavior.

**Evidence limits.** Research on 2026-09-24 used web search only: the session's network policy
blocked opening pages and downloading files (hosts such as `en.debaochina.com`, `www.debaochina.com`,
`www.newdebao.com`, `www.newtop.hk`, `scribd.com`). Every fact below comes from search-result
summaries of the cited pages and must be checked against the full page or the machine's nameplate
before it enters the register. No manual was downloaded.

## Manufacturer

NEWTOP is the brand of **Zhejiang New Debao Machinery Co., Ltd.** (浙江新德宝机械有限公司), founded in
2001 in Ruian as Ruian Debao Machinery and renamed in 2009. It is now in Wanquan Industrial Zone,
Pingyang County, Wenzhou, Zhejiang, China.

- Official sites: `https://en.debaochina.com` (English), `https://www.debaochina.com` (Chinese, has
  parameter and PDF tabs), `https://www.newdebao.com` (English site and blog).
- Contact for manuals, spare-part lists and oil grade: `db@debaochina.com`. Send each machine's
  serial number.
- Not the same company: Newtop Machine (`newtopmachine.com`, flexo printing, Ruian).

## Machines

| Register field        | NEWTOP-FB100S                                                               | NEWTOP-FB158S                                                                                                                      | Third machine ("FB118Dt")                                                                                                                |
| --------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Type                  | Servo paper cup forming machine ("electronic cam")                          | Servo paper cup forming machine                                                                                                    | Most likely **NEWTOP-118DT**: a double-wall **sleeve** machine that glues an outer wall onto formed cups; no "FB118Dt" model was found   |
| Speed                 | 170 pcs/min per product page; one source says 158                           | 175 pcs/min per manufacturer posts; one source says 160                                                                            | 150 pcs/min per product page; listings say 100–120                                                                                       |
| Cup size              | 2.5–10 oz                                                                   | 2.5–12 oz                                                                                                                          | Sources conflict: 6–18 oz vs 8–44 oz                                                                                                     |
| Paper                 | Single-side PE coated                                                       | Not found                                                                                                                          | White or grey board, 0.2825–0.4075 mm                                                                                                    |
| Heating / joining     | Not found (hot air or ultrasonic: check on site)                            | Three hot-air units, curling preheat, servo welding pressure (manufacturer post; the link to this model is likely but not certain) | Glue (type not found)                                                                                                                    |
| Drive and lubrication | Not confirmed                                                               | Not confirmed                                                                                                                      | Shaft, barrel indexing cam and gears in an **oil bath** under the table; oil change every 4–6 months "with specified oil" (product page) |
| Power, air            | Not found                                                                   | Not found                                                                                                                          | 380 V 3-phase, 5 kW; air 0.6–0.8 MPa, 0.4 m³/min (marketplace listing)                                                                   |
| Warranty (stated)     | 3 years mechanical, 1 year electrical and wear parts                        | Not found                                                                                                                          | Conflicting: 3 or 5 years mechanical                                                                                                     |
| Product page          | `en.debaochina.com/paper-cup-machine/newtop-fb100s-servo-paper-cup-machine` | `www.debaochina.com/productdetail/1422612723346178049`                                                                             | `en.debaochina.com/sleeve-machine/newtop-118dt-high-speed-intelligent-paper-cup-sleeve-machine`                                          |

Register defaults until the plant confirms: criticality `HIGH` for the two cup formers, since they
produce cups; the sleeve machine's criticality depends on whether it runs in line behind a former.
Manufacturer, model, serial and year come from the nameplate; unknown values stay empty (TZ-M §8).

## Manuals

- **No public manufacturer manual was found for any of the three models.** The Chinese site shows
  a "PDF download" tab that could not be opened from this session. It may hold brochures or
  manuals.
- Nearby documents that are **not** manuals for these models: a New Debao sales quotation for
  DEBAO-118DT (Scribd 620666478, with a bearing list) and a New Debao manual for DXD cup
  **packing** machines (Scribd 880271419).
- A second search pass on 2026-09-24 (Chinese and English queries, the exact "FB118Dt" code) found
  no manual either. It found two more official pages to open once the hosts are reachable: the
  Chinese servo cup machine product page (`www.debaochina.com/product/intelligent/1413548237599539201`)
  and a service/maintenance section (`www.debaochina.com/service/maintain/...`). Page fetching is
  blocked for the whole session, including the web-fetch tool; no browser extension is connected.
- The most reliable route is the paper manual, CD or USB supplied with each machine, or a request
  to `db@debaochina.com` with the serial numbers. Attach whatever is obtained as
  `OPERATING_MANUAL` with its source (FR-008).

## Draft maintenance plans

Source types: **MFR** is a New Debao statement (a product page or a generic blog, not a manual);
**OTHER** is another manufacturer's service page (Zhejiang Guohao, `paperboxcupmachine.com/service/`;
Ruida); **GP** is general practice. Under FR-020 and FR-022, a plan without a manufacturer document
is published as `PLANT_DECISION` with the chief mechanic as author, and the table below is only
the proposal. Replace rows with manual references once the manuals are obtained.

Daily and per-shift cleaning and visual checks (dust, glue residue, loose fasteners, lubrication
points, air pressure) are operator or shift care. They belong in the zone checklist, not in the
mechanic's planned maintenance ([research.md](research.md) R2).

### Common to all three machines

| Plan (interval)                  | Operations                                                                                                                                                                                                                                        | Materials, parts, tools                                                                        | Source                                             |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Weekly (1 week)                  | Clean photo-eyes; clean the lubrication-pump inlet screen (weekly for the first 2 months, then every 2 weeks); drain the air-preparation unit; check belt and chain tension; inspect sealing jaws and, on hot-air models, clean the blower filter | Lint-free cloth, air gun, filter elements if clogged                                           | OTHER, GP                                          |
| Monthly (1 month)                | Check thermocouple accuracy against an IR thermometer; check electrical connections and drives; check gauges                                                                                                                                      | IR thermometer, torque/tension tools                                                           | MFR (generic blog), OTHER                          |
| Oil change (4–6 months, confirm) | Drain and refill the under-table oil bath; clean the sump and screen; check for leaks                                                                                                                                                             | Gear oil: grade and volume **unknown** (other makers use EP150; confirm with the manufacturer) | MFR for 118DT; FB100S/FB158S only if a sump exists |

### Model-specific additions

- **FB158S**: clean the three hot-air nozzles and the curling preheater and check the hot-air
  temperature (GP interval, weekly proposed).
- **FB100S**: plan heater tasks (hot-air guns) or ultrasonic horn and generator checks only after
  the heating method is confirmed on site.
- **FB100S, FB158S (servo)**: monthly, clean servo drive fans and filters, check cable connectors and
  encoder alarms, back up drive and PLC parameters (GP).
- **118DT**: every shift, clean the glue nozzle and glue tank (operator care); weekly, check sleeve
  feed, photoelectric detectors and air supply at 0.6–0.8 MPa (GP; pressure from a marketplace listing).

### What to keep on hand (wear parts, GP)

Heating elements or hot-air guns and thermocouples (cup formers); knurling and bottom-punch dies,
cutting knives and moulds (cup formers); belts, bearings, air and oil filters, suction cups; glue
nozzles (118DT); the gear oil for one full change per machine. The manufacturer sells bearings,
electrical parts and indexing boxes as spares. Confirm part numbers from the manual or the supplied
spare-parts kit before stocking.

## Questions for the plant

1. The exact model text on each nameplate: is the third machine NEWTOP-118DT (sleeve machine)?
2. Serial number, year, voltage and kW of each machine.
3. Was a manual (paper, CD or USB) supplied? A scan replaces most OTHER and GP rows.
4. The oil grade used and the sump volume. Do FB100S and FB158S have an oil bath or sight glass?
5. Does FB100S seal with hot air or ultrasound?
6. Is the 118DT glue hot-melt or water-based?
7. The compressor pressure and flow, and whether there is an air dryer or filter unit.
8. Which spare-parts kit came with each machine?
9. Remaining warranty and the supplier or dealer contact.
10. Who is the responsible mechanic and the backup mechanic for each machine?
11. Hours of operation per day, if hour-based intervals from the manual are needed (decision D-1).
