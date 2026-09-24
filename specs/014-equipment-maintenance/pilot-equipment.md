# Pilot equipment: NEWTOP paper cup line

**Change**: 014-equipment-maintenance | **Created**: 2026-09-24 | **Updated**: 2026-09-24 |
**Spec**: [spec.md](spec.md)

The owner named three machines for the first register entries (2026-09-24): NEWTOP-FB100S and
NEWTOP-FB158S (paper cup machines) and NEWTOP-FB118Dt. This note records what the manufacturer
publishes about them and drafts their maintenance plans in the structure of FR-020, so the chief
mechanic can confirm them on site. It is onboarding input, not product behavior.

**Evidence.** After network access was granted on 2026-09-24, the manufacturer's pages and its
current catalogue were opened and read directly. Every value below cites the page. Files were saved
outside the repository (they are the manufacturer's material; the product stores them per FR-008).

| ID  | Source                                                                                                                                                                                       | Kind                                |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| C1  | Catalogue «新德宝智能纸杯机 / NewTop Intelligent Paper Cup Machine», edition 2026-4, `https://en.debaochina.com/wp-content/uploads/2026/07/huace-260724.pdf` (37 spreads, 50 MB, image-only) | Manufacturer catalogue              |
| W1  | FB100S product page, `https://en.debaochina.com/paper-cup-machine/newtop-fb100s-servo-paper-cup-machine`                                                                                     | Manufacturer product page           |
| W2  | FB158S product page (Chinese), `https://www.debaochina.com/productdetail/1422612723346178049`                                                                                                | Manufacturer product page           |
| W3  | 118DT product page, `https://en.debaochina.com/sleeve-machine/newtop-118dt-high-speed-intelligent-paper-cup-sleeve-machine`                                                                  | Manufacturer product page           |
| W4  | «机器的日常维护» (daily machine maintenance), `https://www.debaochina.com/service/maintain/939561827476439052`                                                                               | Manufacturer maintenance guidance   |
| W5  | «常见问题» (FAQ), `https://www.debaochina.com/service/problem/939561827476439051`                                                                                                            | Manufacturer maintenance guidance   |
| W6  | Blog "How can you maintain your paper cup making machine for longevity", `https://www.newdebao.com/product-news/how-can-you-maintain-your-paper-cup-making-machine-for-longevity`            | Manufacturer article (not a manual) |

**No operating or maintenance manual is published.** The "PDF download" tab of the FB158S page says
«PDF文件未上传» (no PDF uploaded, W2); the download page offers only the catalogue C1. W4 itself says
the operator must study the **instruction manual supplied with the machine**. W4 and W5 are generic
for New Debao cup machines, not specific to these models.

## Manufacturer

NEWTOP is the brand of **Zhejiang New Debao Machinery Co., Ltd.** (浙江新德宝机械有限公司); the English
site footer also names **Zhejiang NewTop Intelligent Industry Co., Ltd.** Address: Fengzhai Natural
Village, Wandu Village, Wanquan Town, Pingyang County, Wenzhou, Zhejiang, China.

- Sales: +86-577-65578789, +86-577-65561111, `db@debaochina.com`.
- Customer service: +86-13967755677, `db10@debaochina.com` (W4, W5).
- Russia office (C1 p. 66): Василий Цюань +86 139 1088 0697; Антон (Новосибирск) +7 913 839 9300.
- Service offer (C1 p. 66, W5): spare parts, on-site installation, commissioning, routine
  maintenance and technician training; original spare parts for the machine's lifetime.

## Machines

The third machine is **NEWTOP-118DT**: no "FB118Dt" exists in C1 or on the sites, and 118DT is the
only "118D…" model. It is a **sleeve machine**: it glues an outer wall onto cups made by a forming
machine and does not form cups itself. Confirm on the nameplate.

| Register field       | NEWTOP-FB100S (C1 p. 20–21, W1)                              | NEWTOP-FB158S / FB158SV1 (C1 p. 18–19, W2)                                             | NEWTOP-118DT (C1 p. 44–45, W3)                                                              |
| -------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Type                 | Servo paper cup forming machine                              | Servo paper cup forming machine (V1 = current generation)                              | High-speed paper cup **sleeve** machine, PLC, photoelectric monitoring, servo glue spraying |
| Max capacity         | 158 pcs/min (C1); W1 table says 170                          | 175 pcs/min (C1); W2 says 168, its text 180                                            | 150 hollow/appressed, 100 corrugated, 80 embossed pcs/min                                   |
| Cups                 | 2.5–10 oz; top Ø50–80, bottom Ø35–56, H 40–90 mm             | 2.5–12 oz; top Ø50–85, bottom Ø35–60, H 40–110 mm                                      | 6–18 oz (C1); W3 says 8–44 oz; top Ø70–95, bottom Ø50–75, H 60–135 mm                       |
| Paper                | Single PE, 0.22–0.35 mm                                      | Single/double PE, 0.22–0.45 mm (W2: 0.22–0.35)                                         | Grey/white board, 0.2825–0.4075 mm                                                          |
| Sealing              | Hot air + ultrasonic side seam; triple hot air on the bottom | Same; bottom heating drive separated from the punching drive                           | Glue (type not stated)                                                                      |
| Power                | 3-phase 380 V, 22 kW                                         | 3-phase 380 V, 22 kW                                                                   | 3-phase 380 V, 5 kW                                                                         |
| Compressed air       | 0.5–0.7 MPa, 0.3 m³/min (W1: 0.5 m³/min)                     | 0.5–0.7 MPa, 0.3 m³/min                                                                | 0.6–0.8 MPa, 0.4 m³/min                                                                     |
| Weight               | 2400 kg                                                      | 2500 kg                                                                                | 2600 kg                                                                                     |
| Crate size           | 2200×1500×2000 mm; cup-counting holder 1230×610×1900 mm      | 2300×1600×2000 mm; holder 1230×610×1900 mm                                             | 2800×1300×2250 mm                                                                           |
| Lubrication          | Oil bath for all parts under the forming table (W1)          | Oil bath for all parts under the forming table (W2)                                    | Longitudinal shaft, barrel indexing cam and gears in an oil bath (C1, W3)                   |
| Warranty (catalogue) | 3 years mechanical                                           | 3 years mechanical (W2 text says 5 years mechanical, 1 year electrical and wear parts) | 5 years mechanical                                                                          |
| Main components      | XINJE, IKO, AirTAC, NSK, Schneider, Panasonic                | IKO, NSK, SMC, ORION, Schneider, FESTO, Siemens                                        | IKO, Schneider, INOVANCE, AirTAC, Panasonic                                                 |
| Mould change         | About 4 hours (C1)                                           | About 4 hours (C1)                                                                     | Embossing unit optional                                                                     |

Register defaults until the plant confirms: criticality `HIGH` for FB100S and FB158S (they make the
cups), `MEDIUM` for 118DT unless it runs in line behind a former. Serial number and year come from
the nameplates; unknown values stay empty (TZ-M §8).

## Documents to attach (FR-008)

| Machine | Document                                                        | Kind               | Reference                                 |
| ------- | --------------------------------------------------------------- | ------------------ | ----------------------------------------- |
| All     | Catalogue C1 (or the excerpt of its pages 18–21, 44–45, 62, 66) | `OTHER`            | Source URL of C1                          |
| All     | Operating manual supplied with the machine                      | `OPERATING_MANUAL` | Obtain from the plant or the manufacturer |

## Draft maintenance plans

Source types: **MFR-P** is a model product page (W1–W3); **MFR-G** is New Debao's generic maintenance
guidance (W4–W6); **GP** is general practice. A plan without the model's manual is published as
`PLANT_DECISION` with the chief mechanic as author and these sources in the note (FR-020, FR-022).

Operator care stays in the zone checklist, not in the mechanic's plans ([research.md](research.md)
R2). W4 lists the daily care as: inspect and lubricate all joints and moving parts above the table;
check cylinder pins and circlips of linkages; check nuts and bolts; stop the machine on any noise or
abnormal sign. W6 adds cleaning paper dust, glue and ink from mandrels, forming rings, sealing heads,
heaters and sensors every shift, and never over-lubricating.

### FB100S and FB158S (servo cup formers)

| Plan (interval)                                | Operations                                                                                                                                                                                                                                                                                                                                                            | Materials, parts, tools                                     | Source                              |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------- |
| Sensors (every 3 days)                         | Clean all optical (photoelectric) sensors                                                                                                                                                                                                                                                                                                                             | Lint-free cloth                                             | MFR-G W4 ("every 3–5 working days") |
| Weekly (1 week)                                | Clean the blower intake filter; clean the lubrication oil-pump inlet filter (new machine: weekly for 2 months); lubricate manual points per the lubrication chart; check wear of punching blades, bottom punches and grippers                                                                                                                                         | Brush, air gun, lubricant for manual points                 | MFR-G W4, W6                        |
| Oil-pump filter (2 weeks)                      | Clean the lubrication oil-pump inlet filter (after the first 2 months)                                                                                                                                                                                                                                                                                                | —                                                           | MFR-G W4                            |
| Monthly (1 month)                              | Check heater and temperature-sensor calibration with an IR thermometer at the sealing head; check belt/chain tension and wear; power off and tighten terminal blocks; listen for bearing noise and check play in gearbox and bearings; check servo and pneumatic response and control software; inspect the bottom knurling unit and ultrasonic horn contact surfaces | IR thermometer, torque screwdriver                          | MFR-G W5, W6                        |
| First oil change (30 days after commissioning) | Drain and refill the under-table oil bath; clean the oil-pump filter                                                                                                                                                                                                                                                                                                  | Oil: grade and volume not published                         | MFR-G W4                            |
| Oil change (4 months)                          | Drain and refill the under-table oil bath with the specified oil; clean the sump and the pump filter; check for leaks                                                                                                                                                                                                                                                 | Oil: grade and volume not published; one full fill in stock | MFR-P W1, W2 ("every 4–6 months")   |

W4 (generic) allows 6–12 months between oil changes "depending on oil condition", while the model
pages W1–W3 say 4–6 months. The draft uses the model pages and the lower bound, 4 months, until the
manufacturer confirms.

### 118DT (sleeve machine)

| Plan (interval)            | Operations                                                                                                                                                                             | Materials, parts, tools                         | Source                 |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ---------------------- |
| Sensors (every 3 days)     | Clean the photoelectric sensors that monitor the process                                                                                                                               | Lint-free cloth                                 | MFR-G W4; C1 (sensors) |
| Weekly (1 week)            | Clean the lubrication oil-pump inlet filter (new machine: weekly for 2 months); clean the servo glue-spray nozzles and glue lines; lubricate manual points above the table             | Glue-appropriate cleaner (glue type to confirm) | MFR-G W4; GP (glue)    |
| Oil-pump filter (2 weeks)  | Clean the oil-pump inlet filter (after the first 2 months)                                                                                                                             | —                                               | MFR-G W4               |
| Monthly (1 month)          | Check the air supply (0.6–0.8 MPa) and drain the air-preparation unit; check fasteners, cam followers and indexing play; tighten terminal blocks; inspect the embossing unit if fitted | Pressure gauge                                  | MFR-P W3 (air); GP     |
| First oil change (30 days) | Drain and refill the oil bath under the table                                                                                                                                          | Oil: grade and volume not published             | MFR-G W4               |
| Oil change (4 months)      | Drain and refill the oil bath of shaft, indexing cam and gears with the specified oil; check for leaks                                                                                 | Oil: grade and volume not published             | MFR-P W3               |

### What to keep on hand

- **Per machine:** one full fill of the specified gear oil, oil-pump inlet filter elements if
  replaceable, lint-free cloths, IR thermometer (shared).
- **Cup formers (wear parts named by the manufacturer, W5, W6):** punching blades, bottom punches,
  grippers, bottom knurling parts, heating elements and thermocouples; ultrasonic horn parts.
- **118DT:** glue nozzles and glue-line parts (GP).
- Part numbers and quantities: from the spare-parts kit supplied with each machine or from the
  manufacturer. No part numbers are published.

## Questions for the plant and the manufacturer

1. Nameplates: exact model (is the third machine NEWTOP-118DT?), serial number, year, voltage, kW.
2. Was a manual (paper, CD, USB) supplied with each machine? A scan replaces the MFR-G and GP rows.
3. The specified oil for the under-table oil bath: grade, volume per machine, sight glass or level mark.
4. The lubrication chart of manual points (which points, which grease, how often).
5. Glue type on 118DT (hot-melt or water-based) and its cleaning agent.
6. Compressor pressure and flow, and whether there is an air dryer or filter unit.
7. The spare-parts kit supplied, with part numbers.
8. Commissioning date of each machine: it sets the first oil change at 30 days.
9. Responsible and backup mechanic for each machine.
10. Hours of operation per day, if hour-based intervals are needed (decision D-1).

Suggested request to `db@debaochina.com` / `db10@debaochina.com`: "Please send the operating and
maintenance manual (English or Russian), the lubrication chart with oil and grease grades and
volumes, and the spare-parts list for NEWTOP-FB100S s/n …, NEWTOP-FB158S s/n …, NEWTOP-118DT s/n …".
