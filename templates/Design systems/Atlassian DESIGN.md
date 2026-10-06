# Atlassian

## Overview

**Product:** Atlassian
**URL:** https://www.atlassian.com/
**Surface type:** marketing
**Audience:** Business decision-makers and potential customers
**Brand character:** Conversion-focused marketing presence with a rich, diverse color palette and 3 typefaces.

### Design Principles

- Consistency over novelty — reuse existing patterns before inventing new ones.
- Token-driven — every visual decision references a token, not a magic number.
- Accessible by default — compliance is a baseline, not a feature.

## Colors

| Token | Value | Role |
|-------|-------|------|
| --text-color | `#505258` | Text Primary |
| --border-color | `#4B4D51` | Border |
| --border-color | `#DDDEE1` | Border |
| --text-color | `#A9ABAF` | Text Light |
| color-8 | `#F8F8F8` | Background |
| color-9 | `#FFFFFF` | Background |
| color-1 | `#101214` | Text Primary |
| color-4 | `#63666B` | Text Primary |
| color-5 | `#1868DB` | Accent |

## Typography

**Font stack:** Charlie Text, Charlie Display, Atlassian Mono

| Level | Size | Usage |
|-------|------|-------|
| text-xs | 12px | Captions, metadata |
| text-sm | 13px | Labels, secondary text |
| text-base | 16px | Body text (default) |
| text-lg | 20px | Subheadings, emphasis |
| text-xl | 32px | Section headings |
| text-2xl | 40px | Section headings |
| text-3xl | 54px | Section headings |
| text-4xl | 96px | Section headings |
| text-9 | 128px | General use |

**Weight scale:** 400 · 500 · 600 · 700
**Line heights:** 20px · 15.6px · 56.16px · 38.4px · 46.4px · 13.9992px · 16px · 18.2px · 31.2px · 0px · 13.3333px · 24px · 14px · 19.2px · 146px · 18.72px

## Spacing

**Base unit:** 4px

`space-1: 1px` · `space-2: 2px` · `space-3: 4px` · `space-4: 6px` · `space-5: 8px` · `space-6: 10px` · `space-7: 12px` · `space-8: 16px` · `space-9: 24px` · `space-10: 26px` · `space-11: 32px` · `space-12: 35px` · `space-13: 40px` · `space-14: 46px` · `space-15: 60px` · `space-16: 64px` · `space-17: 80px`

## Shapes

**Border radius:** `radius-sm: 3px` · `radius-md: 4px` · `radius-lg: 20px` · `radius-xl: 40px` · `radius-full: 50%` · `radius-6: 100%` · `radius-full: 10000px`

## Elevation

- **shadow-sm:** `rgb(248, 248, 248) 0px 0px 0px 0px`

## Motion

- **duration-fast:** `all`
- **duration-fast:** `none`
- **duration-fast:** `paused`
- **duration-fast:** `scale 0.15s cubic-bezier(0.4, 0, 0, 1), background-color 0.15s cubic-bezier(0.4, 0, 0, 1)`
- **duration-fast:** `box-shadow 0.16s ease-out`
- **duration-base:** `box-shadow 0.25s`
- **duration-base:** `0.25s`
- **duration-base:** `transform 0.25s ease-in-out`
- **duration-slow:** `0.5s ease-out`
- **duration-slow:** `width 0.5s ease-in-out`

## Components

- **Buttons:** 25 detected
- **Links:** 280 detected
- **Navigation:** 1 elements
- **Lists:** 49 detected
- **Images:** 215 detected

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
- Do not mix border-radius values. Pin to the detected set (3px, 4px, 20px, 40px, 50%, 100%, 10000px).
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
- Include known page component density: - **Buttons:** 25 detected
- **Links:** 280 detected
- **Navigation:** 1 elements
- **Lists:** 49 detected
- **Images:** 215 detected

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
