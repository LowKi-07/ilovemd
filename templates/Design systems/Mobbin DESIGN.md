# Mobbin

## Overview

**Product:** Mobbin
**URL:** https://mobbin.com/
**Surface type:** marketing
**Audience:** Business decision-makers and potential customers
**Brand character:** Conversion-focused marketing presence with a rich, diverse color palette and single-typeface typography.

### Design Principles

- Consistency over novelty — reuse existing patterns before inventing new ones.
- Token-driven — every visual decision references a token, not a magic number.
- Accessible by default — compliance is a baseline, not a feature.

## Colors

| Token | Value | Role |
|-------|-------|------|
| color-1 | `#141414` | Text Primary |
| color-3 | `#707070` | Text Secondary |
| color-2 | `#404040` | Background Dark |
| color-4 | `#ADADAD` | Text Light |
| color-5 | `#FFFFFF` | Text Light |

## Typography

**Font stack:** saans

| Level | Size | Usage |
|-------|------|-------|
| text-xs | 12px | Captions, metadata |
| text-sm | 14px | Labels, secondary text |
| text-base | 16px | Body text (default) |
| text-lg | 20px | Subheadings, emphasis |
| text-xl | 80px | Section headings |

**Weight scale:** 400 · 440 · 456 · 600 · 652
**Line heights:** 80px · 24px · 22px · 20px · 16px · 26px

## Spacing

**Base unit:** 8px

`space-1: 1px` · `space-2: 2px` · `space-3: 8px` · `space-4: 12px` · `space-5: 16px` · `space-6: 20px` · `space-7: 24px` · `space-8: 32px` · `space-9: 40px` · `space-10: 48px` · `space-11: 80px` · `space-12: 160px` · `space-13: 190px` · `space-14: 200px`

## Shapes

**Border radius:** `radius-sm: 0px 0px 32px 32px` · `radius-md: 20%` · `radius-lg: 30%` · `radius-full: 9999px`

## Elevation

- **shadow-sm:** `rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, oklab(0.946552 0.0000431836 0.0000188947 / 0.08) 0px 0px 0px 1px inset`
- **shadow-md:** `rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0.16) 0px 12px 80px 0px`

## Motion

- **duration-fast:** `all`
- **duration-fast:** `none`
- **duration-fast:** `color 0.15s cubic-bezier(0, 0, 0.2, 1), background-color 0.15s cubic-bezier(0, 0, 0.2, 1), border-color 0.15s cubic-bezier(0, 0, 0.2, 1), outline-color 0.15s cubic-bezier(0, 0, 0.2, 1), text-decoration-color 0.15s cubic-bezier(0, 0, 0.2, 1), fill 0.15s cubic-bezier(0, 0, 0.2, 1), stroke 0.15s cubic-bezier(0, 0, 0.2, 1), --tw-gradient-from 0.15s cubic-bezier(0, 0, 0.2, 1), --tw-gradient-via 0.15s cubic-bezier(0, 0, 0.2, 1), --tw-gradient-to 0.15s cubic-bezier(0, 0, 0.2, 1)`
- **duration-fast:** `opacity 0.15s cubic-bezier(0, 0, 0.2, 1)`
- **duration-base:** `0.26s cubic-bezier(0.16, 1, 0.3, 1) 1.4s both hero-slot-open`
- **duration-base:** `0.26s cubic-bezier(0.16, 1, 0.3, 1) 1.46s both hero-slot-open`
- **duration-base:** `0.26s cubic-bezier(0.16, 1, 0.3, 1) 1.52s both hero-slot-open`
- **duration-base:** `height 0.3s cubic-bezier(0.33, 1, 0.68, 1), border-color 0.3s cubic-bezier(0.33, 1, 0.68, 1)`

## Components

- **Buttons:** 12 detected
- **Links:** 38 detected
- **Navigation:** 2 elements
- **Lists:** 3 detected
- **Images:** 329 detected

## Do's and Don'ts

### Do

- Reference tokens by name, not raw values — agents and developers should use `color.text.primary`, not `#171717`.
- Define all interactive states: default, hover, focus-visible, active, disabled.
- Use the spacing scale for all padding, margin, and gap values.
- Write content in sentence case. Reserve ALL CAPS for acronyms only.
- Test every component at the smallest and largest breakpoint before shipping.

### Don't

- Do not introduce colors outside the extracted palette.
- Do not use arbitrary spacing values — stick to the scale.
- Do not mix border-radius values. Pin to the detected set (0px 0px 32px 32px, 20%, 30%, 9999px).
- Do not use full-uppercase text for body or paragraph content.
- Do not nest interactive elements (e.g. buttons inside links).
- Do not ship components without defining hover, focus-visible, and disabled states.

## Writing Tone

Concise, confident, implementation-focused. Avoid filler preambles.

## Authoring Workflow

When creating or updating a component guideline for this system, follow this sequence:

1. **State the intent** — one sentence on what the component does and why it exists.
2. **Map tokens** — list every color, spacing, typography, and radius token the component uses. No raw values.
3. **Define anatomy** — break the component into named parts (container, label, icon, etc.) with their token assignments.
4. **Specify states** — document every state: default, hover, focus-visible, active, disabled, loading, error, empty.
5. **Describe interactions** — keyboard, pointer, and touch behavior, including edge cases (long content, overflow, truncation).
6. **Add accessibility criteria** — write testable pass/fail checks (e.g. "focus ring must be visible at 3:1 contrast").
7. **List anti-patterns** — concrete examples of misuse with a brief explanation of why each is wrong.
8. **Close with a QA checklist** — a mechanical list of verifiable items (see Definition of Done below).

## Required Output Structure

Every component guideline produced from this system must contain these sections, in order:

1. Overview — purpose, when to use, when not to use.
2. Tokens and foundations — all referenced tokens from the tables above.
3. Anatomy and variants — named parts, variant matrix, responsive behavior.
4. States and interactions — full state table, keyboard/pointer/touch behavior.
5. Accessibility — ARIA attributes, contrast requirements, focus management, screen reader behavior.
6. Content guidelines — copy length, tone, capitalisation, placeholder text rules.
7. Anti-patterns — explicit examples of what not to build, with reasoning.

## Component Requirements

Every component built against this system must:

- Reference only tokens defined in the tables above — no hardcoded hex, px, or font values.
- Define all interactive states: default, hover, focus-visible, active, disabled, loading, error.
- Specify responsive behavior at the smallest and largest supported breakpoint.
- Handle edge cases: empty state, overflow / truncation, maximum content length.
- Include keyboard navigation (Tab, Enter, Escape, Arrow keys where applicable).
- Document ARIA roles, labels, and live-region behavior where relevant.
- Include known page component density: - **Buttons:** 12 detected
- **Links:** 38 detected
- **Navigation:** 2 elements
- **Lists:** 3 detected
- **Images:** 329 detected

## Definition of Done

A component is not complete until every item below is checked:

- Renders correctly in its default state (smoke test).
- All states documented and visually verified (hover, focus, disabled, loading, error, empty).
- All visual values use design tokens — zero hardcoded values.
- Keyboard navigation works without a pointer.
- No critical accessibility violations (contrast, ARIA, focus order).
- Tested at smallest and largest breakpoint.
- Anti-patterns section lists at least one concrete misuse example.
- Documentation covers purpose, usage, props/API, and limitations.
