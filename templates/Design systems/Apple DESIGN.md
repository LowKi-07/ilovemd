# Apple (India)

## Overview

**Product:** Apple (India)
**URL:** https://www.apple.com/in/
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
| color-1 | `#1D1D1F` | Text Primary |
| color-3 | `#6E6E73` | Text Secondary |
| color-2 | `#0066CC` | Accent |
| color-4 | `#0071E3` | Accent |
| color-5 | `#2997FF` | Accent |
| color-6 | `#F5F5F7` | Text Light |
| color-7 | `#FFFFFF` | Text Light |

## Typography

**Font stack:** SF Pro Text, SF Pro Display

| Level | Size | Usage |
|-------|------|-------|
| text-xs | 12px | Captions, metadata |
| text-sm | 14px | Labels, secondary text |
| text-base | 17px | Body text (default) |
| text-lg | 19px | Subheadings, emphasis |
| text-xl | 26px | Section headings |
| text-2xl | 28px | Section headings |
| text-3xl | 34px | Section headings |
| text-4xl | 44px | Section headings |
| text-9 | 56px | General use |

**Weight scale:** 400 · 600
**Line heights:** 50px · 37.5px · 60px · 25px · 21.0012px · 12px · 20.0003px · 20.0002px · 44px · 23px · 32px

## Spacing

**Base unit:** 4px

`space-1: 4px` · `space-2: 5px` · `space-3: 6px` · `space-4: 8px` · `space-5: 9px` · `space-6: 11px` · `space-7: 12px` · `space-8: 16px` · `space-9: 17px` · `space-10: 21px` · `space-11: 22px` · `space-12: 44px` · `space-13: 56px` · `space-14: 63px` · `space-15: 139px` · `space-16: 310px` · `space-17: 324px`

## Shapes

**Border radius:** `radius-sm: 980px`

## Elevation

_None detected._

## Motion

- **duration-fast:** `all`
- **duration-fast:** `none`
- **duration-base:** `opacity 0.24s cubic-bezier(0.4, 0, 0.6, 1) 0.08s, visibility 0.24s steps(1, start) 0.08s`
- **duration-slow:** `color 0.32s cubic-bezier(0.4, 0, 0.6, 1)`

## Components

- **Buttons:** 28 detected
- **Links:** 299 detected
- **Inputs:** 1 detected
- **Navigation:** 2 elements
- **Lists:** 56 detected
- **Forms:** 1 detected
- **Images:** 159 detected

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
- Do not mix border-radius values. Pin to the detected set (980px).
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
- Include known page component density: - **Buttons:** 28 detected
- **Links:** 299 detected
- **Inputs:** 1 detected
- **Navigation:** 2 elements
- **Lists:** 56 detected
- **Forms:** 1 detected
- **Images:** 159 detected

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
