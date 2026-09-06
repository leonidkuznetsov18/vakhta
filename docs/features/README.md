# Feature docs

One Markdown file per feature, written for the support assistant and for people who join the
project. The support bot (@vakhta_support_bot) loads every file in this folder, the user guide
(`docs/user-guide/vakhta-user-guide.ru.html`) and the changelog into its context, so what is written
here is what the assistant will tell employees, masters and administrators.

Rules:

- English, plain sentences, present tense. Name buttons and sections exactly as they appear in the
  interface (Russian labels in quotes where it helps, e.g. "Открыть смену сотруднику").
- Structure: what it is, how it works, where it lives in the bot / panel / kiosk, typical questions.
- Update the file in the same pull request as the feature; a feature without its doc is not done.
- Numbered file names keep the reading order; the assistant does not care about the numbers.
