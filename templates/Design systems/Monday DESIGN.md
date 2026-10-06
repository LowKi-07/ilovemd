# The AI Work Platform for People & Agents | monday.com

## Overview

**Product:** The AI Work Platform for People & Agents | monday.com
**URL:** https://monday.com/
**Surface type:** marketing
**Audience:** Business decision-makers and potential customers
**Brand character:** Conversion-focused marketing presence with a rich, diverse color palette and a complementary two-font typographic system.

### Design Principles

- Consistency over novelty — reuse existing patterns before inventing new ones.
- Token-driven — every visual decision references a token, not a magic number.
- Accessible by default — compliance is a baseline, not a feature.

## Colors

| Token | Value | Role |
|-------|-------|------|
| --surface-light | `#F3F4F5` | Surface |
| --primary-green | `#00C875` | Text Primary |
| --secondary | `#676879` | Text Secondary |
| color-8 | `#D9D7FF` | Surface |
| color-1 | `#000000` | Text Primary |
| color-2 | `#535768` | Text Primary |
| color-6 | `#8F8A8A` | Text Secondary |
| color-3 | `#B11B4A` | Accent |
| color-5 | `#6161FF` | Accent |
| color-9 | `#F3F3F5` | Border |
| color-11 | `#FFFFFF` | Text Light |

## Typography

**Font stack:** Poppins, sans-serif

| Level | Size | Usage |
|-------|------|-------|
| text-xs | 13px | Captions, metadata |
| text-sm | 16px | Labels, secondary text |
| text-base | 18px | Body text (default) |
| text-lg | 28px | Subheadings, emphasis |
| text-xl | 56px | Section headings |

**Weight scale:** 300 · 400
**Line heights:** 67.2px · 36.4px · 26.8071px · 28px · 24px · 20px · 14px · 13px · 15.6px · 25.2px

## Spacing

**Base unit:** 4px

`space-1: 6px` · `space-2: 8px` · `space-3: 10px` · `space-4: 12px` · `space-5: 14px` · `space-6: 16px` · `space-7: 20px` · `space-8: 24px` · `space-9: 32px` · `space-10: 35px` · `space-11: 39px` · `space-12: 40px` · `space-13: 48px` · `space-14: 64px` · `space-15: 80px` · `space-16: 96px` · `space-17: 204px` · `space-18: 249px`

## Shapes

**Border radius:** `radius-sm: 8px` · `radius-md: 24px` · `radius-lg: 32px` · `radius-xl: 80px` · `radius-full: 160px` · `radius-6: 1600px`

## Elevation

- **shadow-sm:** `rgba(0, 0, 0, 0.1) 0px 0px 20px 0px`
- **shadow-md:** `rgba(0, 0, 0, 0.1) 0px 20px 40px 0px`

## Motion

- **duration-fast:** `all`
- **duration-fast:** `none`
- **duration-fast:** `0.1s`
- **duration-base:** `opacity 0.2s`
- **duration-base:** `transform 0.2s`
- **duration-base:** `0.25s ease-in-out`
- **duration-base:** `0.25s`
- **duration-base:** `background-color 0.3s cubic-bezier(0.515, 0.147, 0.25, 1)`
- **duration-base:** `transform 0.3s`
- **duration-base:** `opacity 0.3s, transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)`
- **duration-base:** `0.3s`
- **duration-slow:** `6s ease-in-out 2s infinite both orbSwoosh`
- **duration-slow:** `21.25s linear infinite scrollMarquee`

## Components

- **Buttons:** 82 detected
- **Links:** 332 detected
- **Inputs:** 2 detected
- **Navigation:** 2 elements
- **Lists:** 20 detected
- **Forms:** 2 detected
- **Images:** 861 detected

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
- Do not mix border-radius values. Pin to the detected set (8px, 24px, 32px, 80px, 160px, 1600px).
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
- Include known page component density: - **Buttons:** 82 detected
- **Links:** 332 detected
- **Inputs:** 2 detected
- **Navigation:** 2 elements
- **Lists:** 20 detected
- **Forms:** 2 detected
- **Images:** 861 detected

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
