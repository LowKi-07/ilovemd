# Tesla

## Overview

**Product:** Tesla
**URL:** https://www.tesla.com/
**Surface type:** e-commerce
**Audience:** Consumers and shoppers
**Brand character:** Product-focused shopping experience with a rich, diverse color palette and a complementary two-font typographic system.

### Design Principles

- Trust signals first — credibility reduces friction more than clever copy.
- Clear path to action — one primary CTA per view, never stacked.
- Speed over polish — perceived performance is part of the design system.

## Colors

| Token | Value | Role |
|-------|-------|------|
| color-6 | `#F4F4F4` | Background |
| color-1 | `#171A20` | Text Primary |
| color-2 | `#5C5E62` | Text Primary |
| color-3 | `#3E6AE1` | Accent |
| color-4 | `#D0D1D2` | Text Light |
| color-5 | `#EEEEEE` | Text Light |
| color-7 | `#FFFFFF` | Text Light |

## Typography

**Font stack:** Universal Sans Display, Universal Sans Text

| Level | Size | Usage |
|-------|------|-------|
| text-xs | 0px | Captions, metadata |
| text-sm | 7px | Labels, secondary text |
| text-base | 12px | Body text (default) |
| text-lg | 14px | Subheadings, emphasis |
| text-xl | 17px | Section headings |
| text-2xl | 20px | Section headings |
| text-3xl | 34px | Section headings |
| text-4xl | 40px | Section headings |
| text-9 | 48px | General use |

**Weight scale:** 400 · 500
**Line heights:** 56px · 28px · 48px · 24px · 44px · 20px · 12px · 16.968px · 16.8px · 7px

## Spacing

**Base unit:** 8px

`space-1: 4px` · `space-2: 8px` · `space-3: 10px` · `space-4: 16px` · `space-5: 20px` · `space-6: 24px` · `space-7: 32px` · `space-8: 40px` · `space-9: 48px`

## Shapes

**Border radius:** `radius-sm: 0px 8px 8px 0px` · `radius-md: 4px` · `radius-lg: 8px`

## Elevation

- **shadow-sm:** `rgba(0, 0, 0, 0) 0px 0px 0px 0px inset, rgba(0, 0, 0, 0) 0px 0px 0px 0px`
- **shadow-md:** `rgba(0, 0, 0, 0) 0px 0px 0px 2px inset`
- **shadow-lg:** `rgb(255, 255, 255) 0px 2px 0px -1px`
- **shadow-xl:** `rgba(0, 0, 0, 0.25) 0px 4px 4px 0px`
- **shadow-5:** `rgba(0, 0, 0, 0.1) 0px -2px 8px 0px`

## Motion

- **duration-fast:** `all`
- **duration-fast:** `none`
- **duration-base:** `background-color 0.3s, box-shadow 0.3s, color 0.3s`
- **duration-base:** `fill 0.3s, stroke 0.3s`
- **duration-base:** `transform 0.3s ease-in-out, box-shadow 0.3s ease-in-out`
- **duration-slow:** `font 0.33s, color 0.33s, opacity 0.33s, padding 0.33s`
- **duration-slow:** `color 0.33s, background-color 0.33s`
- **duration-slow:** `color 0.33s, background-color 0.33s, box-shadow 0.25s, transform 0.33s cubic-bezier(0.5, 0, 0, 0.75)`
- **duration-slow:** `border-color 0.33s, background-color 0.33s, color 0.33s, box-shadow 0.25s`
- **duration-slow:** `box-shadow 0.33s cubic-bezier(0.5, 0, 0, 0.75), color 0.33s`
- **duration-slow:** `color 0.33s, transform 0.5s cubic-bezier(0.5, 0, 0, 0.75)`
- **duration-slow:** `background-color 0.33s, box-shadow 0.33s`
- **duration-slow:** `background-color 0.5s, backdrop-filter 0.5s, -webkit-backdrop-filter 0.5s`
- **duration-slow:** `transform 0.5s`
- **duration-slow:** `0.8s ease-in-out`
- **duration-slow:** `opacity 1s ease-out, visibility 1s ease-out`
- **duration-slow:** `1s tds--fade-in`

## Components

- **Buttons:** 85 detected
- **Links:** 369 detected
- **Navigation:** 17 elements
- **Lists:** 43 detected
- **Images:** 68 detected

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
- Do not mix border-radius values. Pin to the detected set (0px 8px 8px 0px, 4px, 8px).
- Do not stack more than one primary CTA per viewport.
- Do not use red for non-error UI — reserve it for destructive actions and warnings.
- Do not ship components without defining hover, focus-visible, and disabled states.

## Writing Tone

Persuasive, benefit-driven, trustworthy. Active voice, urgency without pressure.

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
- Include known page component density: - **Buttons:** 85 detected
- **Links:** 369 detected
- **Navigation:** 17 elements
- **Lists:** 43 detected
- **Images:** 68 detected

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
