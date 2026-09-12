# Connecteam product profile

Research date: 2026-09-12. Based on public vendor documentation, not a hands-on trial. This profile does not establish market leadership or suitability for a particular production site. See [competitors](2026-09-12-connecteam-competitive-landscape.md).

## Product model

Connecteam combines Operations, Communications, and HR & Skills hubs. Its own homepage uses a number-one slogan; this is a vendor claim, not an independently verified market-share result. [Homepage](https://connecteam.com/)

## Capabilities

- Time tracking includes attendance, location checks, paid/unpaid breaks, timesheet review, exports, and payroll integrations. Quick Tasks supports assigned and recurring work with reminders. [Operations overview](https://help.connecteam.com/en/articles/5949142-the-operations-hub)
- Scheduling includes calendar views, drafts, templates, bulk entry, and CSV import. [Scheduler guide](https://help.connecteam.com/en/articles/4100339-starting-guide-to-the-job-scheduler)
- Automatic assignment considers configured availability, overlapping shifts, approved leave, qualifications, preferences, fairness, and scheduling rules. Assignment produces drafts; some shifts can remain unassigned. [Auto assignment](https://help.connecteam.com/en/articles/8886939-automatically-assign-shifts-in-connecteam)
- Forms support configurable required fields, photos, signatures, location stamps, conditional questions, and creation from files using AI. [Forms guide](https://help.connecteam.com/en/articles/4225197-starting-guide-to-forms)
- Communication includes chats, announcements, read status, surveys, events, directory, and knowledge resources. [Communication overview](https://help.connecteam.com/en/articles/5951839-the-communication-hub)
- HR includes leave, courses, quizzes, documents, employee timelines, recognition, and rewards. [HR overview](https://help.connecteam.com/en/articles/5957871-introduction-to-the-hr-hub)
- Smart Groups use employee fields to assign membership automatically and distribute features/content. [Smart Groups](https://help.connecteam.com/en/articles/6114686-smart-groups-and-segments)
- Automations link triggers, actions, delays, and conditions; AI can help build them. Advanced and Expert have different capabilities. The feature is beta with gradual rollout. [Automations](https://help.connecteam.com/en/articles/13438104-starting-guide-to-automations)
- Knowledge agents answer from selected company resources, show sources, and support group assignment. The documented requirement is Communications Expert, with up to 20 agents. [Knowledge agents](https://help.connecteam.com/en/articles/11112114-connecteam-s-knowledge-base-agent-your-company-s-ai-assistant)

## Constraints relevant to Vakhta

- The documented shared-device kiosk uses a personal PIN, with optional selfie capture and inactivity logout. It is a mobile/tablet app; this differs from Vakhta's rotating QR-to-Telegram flow. A selfie capture is not proof of biometric identity verification. [Kiosk guide](https://help.connecteam.com/en/articles/6135619-the-kiosk-app)
- Standard mobile, kiosk, desktop, and NFC time punches require internet. A custom physical-clock API integration can buffer punches separately. [Offline time clock](https://help.connecteam.com/en/articles/16287971-does-the-time-clock-support-offline-mode)
- Ukrainian is absent from the published dashboard/app language lists inspected; Russian is listed. This is a documentation observation, not a tested current-app limitation. [Languages](https://help.connecteam.com/en/articles/5365277-configure-your-preferred-language)
- A help article describes requiring a confirmation field before clock-out instead of directly requiring a completed form. It does not establish the impossibility of a newer/custom automated workflow. [Clock-out form requirement](https://help.connecteam.com/en/articles/9293586-how-can-i-set-requirements-for-completing-a-form-before-clocking-out)
- API access requires Expert or higher on the relevant hub. [API access](https://developer.connecteam.com/docs/api-access)

## Subscription arithmetic

Operations annual-billing monthly equivalents: Basic $29 for 30 users plus $0.80/additional user; Advanced $49 plus $2.50; Expert $99 plus $4.20. For an illustrative 100 users, the corresponding monthly equivalents are $85, $224, and $393. Communications and HR subscriptions are separate; this is not a full-company quote. [Pricing](https://connecteam.com/pricing/)

## Comparison boundary

Vakhta's inspected `packages/domain/src/shift-fsm/machine.ts` and `states.ts` explicitly model preparation, work, breaks, downtime, cleaning, handover, readiness to close, and guarded transitions. This verifies code structure only, not deployed end-to-end behavior. Whether Connecteam reproduces the same process requires a configured scenario test. Neither feature overlap nor a missing published example establishes full equivalence or a defensible commercial advantage.
