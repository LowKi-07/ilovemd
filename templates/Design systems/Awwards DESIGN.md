# Awwwards

## Overview

**Product:** Awwwards
**URL:** https://www.awwwards.com/
**Surface type:** marketing
**Audience:** Business decision-makers and potential customers
**Brand character:** Conversion-focused marketing presence with a rich, diverse color palette and a complementary two-font typographic system.

> **Note:** Surface detection confidence is low. Verify the inferred audience and brand context before relying on this file.

### Design Principles

- Consistency over novelty — reuse existing patterns before inventing new ones.
- Token-driven — every visual decision references a token, not a magic number.
- Accessible by default — compliance is a baseline, not a feature.

## Colors

| Token | Value | Role |
|-------|-------|------|
| --bg-input-hover | `#F8F8F8` | Background |
| --color-6 | `#502BD8` | Text Primary |
| --color-awards-3 | `#917EDA` | Text Secondary |
| --color-awards-2 | `#6749D1` | Accent |
| --color-1 | `#EC6237` | Accent |
| --color-red | `#FA5D29` | Accent |
| --color-connect | `#FF602C` | Accent |
| --color-read | `#C0AB3C` | Accent |
| --color-blue | `#49B3FC` | Accent |
| --color-jobs | `#74BCFF` | Accent |
| --border-input | `#EDEDED` | Border |
| --color-connect-2 | `#FFAE94` | Text Light |
| --color-read-2 | `#CDC38B` | Text Light |
| --color-jobs-2 | `#99CCFC` | Text Light |
| --color-7 | `#FCB6F2` | Text Light |
| --color-connect-3 | `#FFC5B1` | Text Light |
| --color-jobs-3 | `#B4D7F8` | Text Light |
| --color-read-3 | `#DBD6C0` | Text Light |
| --color-2 | `#E5D8CA` | Text Light |
| --color-inspire-2 | `#C8E4D3` | Text Light |

_Showing 20 of 29 detected colors. Full palette available in the extension._

## Typography

**Font stack:** Inter Tight, Times

| Level | Size | Usage |
|-------|------|-------|
| text-xs | 10px | Captions, metadata |
| text-sm | 12px | Labels, secondary text |
| text-base | 13px | Body text (default) |
| text-lg | 19px | Subheadings, emphasis |
| text-xl | 20px | Section headings |
| text-2xl | 118px | Section headings |

**Weight scale:** 300 · 400 · 500 · 600
**Line heights:** 28px · 117.899px · 17px · 42px · 60px · 14px · 18px · 19.1859px

## Spacing

**Base unit:** 4px

`space-1: 1px` · `space-2: 2px` · `space-3: 4px` · `space-4: 6px` · `space-5: 8px` · `space-6: 10px` · `space-7: 12px` · `space-8: 14px` · `space-9: 16px` · `space-10: 20px` · `space-11: 24px` · `space-12: 38px` · `space-13: 40px` · `space-14: 52px` · `space-15: 60px` · `space-16: 67px` · `space-17: 71px` · `space-18: 81px` · `space-19: 200px`

## Shapes

**Border radius:** `radius-sm: 4px` · `radius-md: 8px` · `radius-lg: 8px 0px 0px 8px` · `radius-xl: 12px` · `radius-full: 50%`

## Elevation

_None detected._

## Motion

- **duration-fast:** `all`
- **duration-fast:** `none`
- **duration-base:** `0.3s`
- **duration-base:** `color 0.3s, background 0.3s, border 0.3s`
- **duration-base:** `max-width 0.3s, padding 0.3s, margin 0.3s, color 0.3s, background 0.3s, border-radius 0.3s, border-color 0.3s, opacity 0.3s`
- **duration-base:** `0.3s ease-in-out`
- **duration-base:** `background 0.3s`
- **duration-slow:** `0.4s`

## Components

- **Buttons:** 1 detected
- **Links:** 204 detected
- **Inputs:** 2 detected
- **Navigation:** 2 elements
- **Lists:** 45 detected
- **Tables:** 1 detected
- **Images:** 126 detected

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
- Do not mix border-radius values. Pin to the detected set (4px, 8px, 8px 0px 0px 8px, 12px, 50%).
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
- Include known page component density: - **Buttons:** 1 detected
- **Links:** 204 detected
- **Inputs:** 2 detected
- **Navigation:** 2 elements
- **Lists:** 45 detected
- **Tables:** 1 detected
- **Images:** 126 detected

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
