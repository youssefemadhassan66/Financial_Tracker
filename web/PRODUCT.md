# Product

## Register

product

## Users

People who want to see where their money goes without typing every expense. Today the only user is the builder; the product should look ready for strangers to sign up later. They open it on a phone in the evening or a laptop during the day, for a quick check of what the bank SMS messages recorded, to fix what the parser could not read, and for a weekly look at spending per category. Money arrives in two currencies (EGP and USD) that are never added together.

## Product Purpose

A personal finance tracker fed automatically: the phone forwards bank SMS, the server turns them into transactions, card statement PDFs fill in what SMS missed, and recurring charges become tracked subscriptions. Success is a user who trusts the numbers enough to stop keeping a spreadsheet, and who can resolve anything the automation got wrong in a few taps.

## Brand Personality

Warm, friendly, encouraging. Money should feel less stressful here, never judged. Polished and data-clear like the Stripe Dashboard: real tables, clear numbers, charts that answer a question, but with a softer, more human surface. Copy is plain and kind ("Nothing to fix today"), never scolding.

## Anti-references

- Old bank portals: navy and gold, stiff corporate grey tables.
- Crypto and trading apps: black backgrounds, neon green and red, casino energy.
- Generic AI SaaS: purple gradients, glass cards, big hero numbers, emoji decoration.
- Budget-shaming apps: red warnings everywhere, guilt about spending.

## Design Principles

1. **Numbers are the interface.** Amounts, dates and currencies are the most legible thing on every screen; decoration never competes with them.
2. **Calm by default, clear when it matters.** Warnings (missed charge, price change, unparsed SMS) are visible and specific, but the resting state is quiet and reassuring.
3. **Never mix currencies.** EGP and USD are always shown separately; the UI never implies a combined total.
4. **Automation first, correction close by.** The app shows what it recorded and makes fixing a mistake one obvious step away.
5. **Kind words.** Every message explains what happened and what to do next, in plain language, without blame.

## Accessibility & Inclusion

- WCAG 2.2 AA contrast in both light and dark themes; visible focus rings; full keyboard use.
- Respect `prefers-reduced-motion`: no non-essential animation when it is set.
- Money direction is never shown by red/green alone: always a sign (+/-) and/or an icon or label as well.
- Layout must not block adding Arabic (RTL) later: prefer logical properties (`ms-`, `me-`, `ps-`, `pe-`, `start`, `end`) over left/right.
- Theme follows the operating system (light and dark).
