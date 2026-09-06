## [0.7.1](https://github.com/leonidkuznetsov18/vakhta/compare/v0.7.0...v0.7.1) (2026-09-06)

### Bug fixes

* **handover:** the checklist opens for every shift, with or without a zone ([8b6cf06](https://github.com/leonidkuznetsov18/vakhta/commit/8b6cf06fac47e9393fa5f7823c7c69f087b2422f))

## [0.7.0](https://github.com/leonidkuznetsov18/vakhta/compare/v0.6.0...v0.7.0) (2026-09-06)

### Features

* **bot:** push a fresh home screen after shift changes made outside the bot ([53332ec](https://github.com/leonidkuznetsov18/vakhta/commit/53332ec2495afc6056f007d7ad5aaacfacf02421))

## [0.6.0](https://github.com/leonidkuznetsov18/vakhta/compare/v0.5.0...v0.6.0) (2026-09-06)

### Features

* **handover:** admin-built checklists per position with mandatory photo items ([0865150](https://github.com/leonidkuznetsov18/vakhta/commit/08651500d23326aa5b3d5bdecb951619cdaad65f))

## [0.5.0](https://github.com/leonidkuznetsov18/vakhta/compare/v0.4.0...v0.5.0) (2026-09-06)

### Features

* **admin-web:** phase 1 of the UX plan ([6ede9d6](https://github.com/leonidkuznetsov18/vakhta/commit/6ede9d6c67b42cee690843577f954a0128259d18))
* phase 2 of the UX plan ([19803c4](https://github.com/leonidkuznetsov18/vakhta/commit/19803c46960ee7e7f340868f670617891f21fd8d))
* phase 3 of the UX plan ([e4bb432](https://github.com/leonidkuznetsov18/vakhta/commit/e4bb43286882db262e511845e24621906bb05e81))

### Documentation

* mark the UX plan phases as shipped and list the deferred items ([61eaa53](https://github.com/leonidkuznetsov18/vakhta/commit/61eaa53d261d1d04b5d583d12fc383c89407299e))
* UI/UX improvement plan after the pilot review ([11af84c](https://github.com/leonidkuznetsov18/vakhta/commit/11af84c95a66abc23063b16c4370f3e33d3a7255))

### Tests

* **admin-web:** allow 20 s per test for dialog-heavy pages on slow CI runners ([505b7a6](https://github.com/leonidkuznetsov18/vakhta/commit/505b7a6d763bc95f3cb04450224f4758c947543a))
* **admin-web:** drop the raised test timeout now that dialogs are mocked ([259f1cc](https://github.com/leonidkuznetsov18/vakhta/commit/259f1cc65db99518140dedc176a8e17e1d6aaa76))
* **admin-web:** mock the sheet and add-dialog wrappers, skip hidden checks in role queries ([6fbffba](https://github.com/leonidkuznetsov18/vakhta/commit/6fbffbaded1c5ebaa0752f48beb62738409a269b))

## [0.4.0](https://github.com/leonidkuznetsov18/vakhta/compare/v0.3.0...v0.4.0) (2026-09-06)

### Features

* row menus, remembered panel state, terminal CRUD, bot back button ([799edca](https://github.com/leonidkuznetsov18/vakhta/commit/799edca99057fa0c0c3e21c5abfe327f96fff2f3))

## [0.3.0](https://github.com/leonidkuznetsov18/vakhta/compare/v0.2.2...v0.3.0) (2026-09-06)

### Features

* pair terminals from the panel, delete draft schedules, calendar fields ([f4024ef](https://github.com/leonidkuznetsov18/vakhta/commit/f4024ef39ba15f72e172f54cf1e0c72b6f4f2a2d))

### Documentation

* user guide for the pilot (bot, terminal, panel) ([14b2551](https://github.com/leonidkuznetsov18/vakhta/commit/14b255193da13b4057c86970fa227004ffc6eb3e))

### CI/CD

* include the Prettier check in pnpm check and format the deploy doc ([fdbb298](https://github.com/leonidkuznetsov18/vakhta/commit/fdbb29895ddf43c54c047b6c6a30ddeb97b543c0))

## [0.2.2](https://github.com/leonidkuznetsov18/vakhta/compare/v0.2.1...v0.2.2) (2026-09-06)

### Bug fixes

* **api:** allow the x-locale header in CORS preflight ([b8aa0e4](https://github.com/leonidkuznetsov18/vakhta/commit/b8aa0e4f8bb6f6685437c57494ec9ee4bb540875))

## [0.2.1](https://github.com/leonidkuznetsov18/vakhta/compare/v0.2.0...v0.2.1) (2026-09-06)

### Bug fixes

* **web:** redirect the pages.dev hosts to the canonical domains ([74c4733](https://github.com/leonidkuznetsov18/vakhta/commit/74c4733ec0b32baef8a15254026430584d8dd8a8))

### CI/CD

* exclude the generated changelog from the format check ([64a48b3](https://github.com/leonidkuznetsov18/vakhta/commit/64a48b3470ace3a73631f7dc1fa429c03e72d281))

## [0.2.0](https://github.com/leonidkuznetsov18/vakhta/compare/v0.1.0...v0.2.0) (2026-09-06)

### Features

* **admin-web:** rebuild the panel on shadcn/ui ([7b42c5a](https://github.com/leonidkuznetsov18/vakhta/commit/7b42c5aa910f313361d1a7adcd5a95bc6b958897))
* **admin-web:** shadcn/ui foundation with Tailwind v4 and the Radix Nova preset ([08048e0](https://github.com/leonidkuznetsov18/vakhta/commit/08048e023c891fbb83de19422770fab1d74cbb46))

### Bug fixes

* **ci:** pin the conventionalcommits preset to v8 ([17df5ac](https://github.com/leonidkuznetsov18/vakhta/commit/17df5ac5e9b4a94997d0d90a56166faa77514abf))

### Documentation

* admin panel UI conventions (shadcn/ui, pagination, validation, tooltips, states) ([67ba64a](https://github.com/leonidkuznetsov18/vakhta/commit/67ba64aaa838c88662d0c0b39bfa023a771a2009))

### CI/CD

* automated releases and deployments from master ([5038f1b](https://github.com/leonidkuznetsov18/vakhta/commit/5038f1bf5827a156d00079eb4031382496fa5c54))
