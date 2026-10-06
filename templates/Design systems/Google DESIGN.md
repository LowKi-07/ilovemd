# Google

## Overview

**Product:** Google
**URL:** https://www.google.com/
**Surface type:** e-commerce
**Audience:** Consumers and shoppers
**Brand character:** Product-focused shopping experience with a rich, diverse color palette and 5 typefaces.

> **Note:** Surface detection confidence is low. Verify the inferred audience and brand context before relying on this file.

### Design Principles

- Trust signals first — credibility reduces friction more than clever copy.
- Clear path to action — one primary CTA per view, never stacked.
- Speed over polish — perceived performance is part of the design system.

## Colors

| Token | Value | Role |
|-------|-------|------|
| color-7 | `#C2E7FF` | Surface |
| color-1 | `#001D35` | Text Primary |
| color-3 | `#4D5156` | Border |
| color-2 | `#4E5059` | Background Dark |
| color-4 | `#BFBFBF` | Text Light |
| color-5 | `#99C3FF` | Text Light |
| color-6 | `#C4C7C5` | Text Light |
| color-8 | `#E3E3E3` | Text Light |
| color-9 | `#E8E8E8` | Text Light |
| color-10 | `#E8EAED` | Text Light |
| color-11 | `#FFFFFF` | Text Light |

## Typography

**Font stack:** Google Sans Text, Arial, Google Sans, arial, Times

| Level | Size | Usage |
|-------|------|-------|
| text-xs | 13px | Captions, metadata |
| text-sm | 15px | Labels, secondary text |

**Weight scale:** 400 · 500
**Line heights:** 18px · 20px · 44px · 22px · 24px · 28px

## Spacing

**Base unit:** 4px

`space-1: 4px` · `space-2: 5px` · `space-3: 6px` · `space-4: 7px` · `space-5: 8px` · `space-6: 10px` · `space-7: 11px` · `space-8: 12px` · `space-9: 14px` · `space-10: 15px` · `space-11: 16px` · `space-12: 18px` · `space-13: 20px` · `space-14: 24px` · `space-15: 30px` · `space-16: 48px` · `space-17: 96px` · `space-18: 231px`

## Shapes

**Border radius:** `radius-sm: 8px` · `radius-md: 24px` · `radius-lg: 26px` · `radius-full: 50%` · `radius-full: 100px` · `radius-full: 9999px`

## Elevation

_None detected._

## Motion

- **duration-fast:** `all`
- **duration-fast:** `none`
- **duration-fast:** `opacity 0.05s linear, visibility 0.05s linear`
- **duration-fast:** `--aim-button-gradient-start 0.05s, --aim-button-gradient-end 0.05s`
- **duration-fast:** `height 0.15s`
- **duration-base:** `opacity 0.3s ease-in-out`
- **duration-slow:** `opacity 0.383s cubic-bezier(0.38, 0.72, 0, 1)`
- **duration-slow:** `transform 0.383s cubic-bezier(0.38, 0.72, 0, 1)`
- **duration-slow:** `transform 0.5s cubic-bezier(0.2, 0, 0, 1), opacity 0.017s linear 0.083s, visibility linear`

## Components

- **Buttons:** 30 detected
- **Links:** 27 detected
- **Inputs:** 4 detected
- **Navigation:** 1 elements
- **Lists:** 2 detected
- **Forms:** 1 detected
- **Images:** 40 detected

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
- Do not mix border-radius values. Pin to the detected set (8px, 24px, 26px, 50%, 100px, 9999px).
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
- Include known page component density: - **Buttons:** 30 detected
- **Links:** 27 detected
- **Inputs:** 4 detected
- **Navigation:** 1 elements
- **Lists:** 2 detected
- **Forms:** 1 detected
- **Images:** 40 detected

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
