# Tutor Connect — Vision CRM

The Vision Academics admin system: students and families, classes and lessons,
the roll, hours packages, billing, and tutor pay.

## Start here

| Document | What it covers |
|---|---|
| [`docs/BUILD-GUIDE.md`](docs/BUILD-GUIDE.md) | **Read this first.** How to get in, where every screen lives, what is built and what is not. |
| [`docs/spec/`](docs/spec/) | The build specification. `01-domain-model.md` explains the business; the rest follows from it. |
| [`docs/spec/08-CUSTOMISE-ME.md`](docs/spec/08-CUSTOMISE-ME.md) | Branding, naming and settings. Overrides every other spec file. |
| [`docs/DESIGN-SYSTEM.md`](docs/DESIGN-SYSTEM.md) | The spatial (visionOS-style) design system — materials, motion, environments, and what to send for fonts, icons and backgrounds. |
| [`docs/AIRTABLE-MIGRATION.md`](docs/AIRTABLE-MIGRATION.md) | How to move Vision Admin V2 into the app — written against the real base, with the decisions that have to be made first. |
| [`supabase/tests/`](supabase/tests/) | The schema verification suite and how to run it. |

The original Lovable prototype is kept, working, at `/prototype/*`.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/18ed47e9-415e-414c-a5fb-19e372a38c00).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
