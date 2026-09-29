# Design-system docs: draft first, then ask

A methodology for documenting components, pages, and templates. It exists because
the two obvious alternatives fail: a blank template stalls the writer on the hard
sections, and a questionnaire-first flow wastes the user's time asking things the
source code already answers. The fix is a strict order of operations:

```
classify the subject → draft everything source can prove →
leave what it can't as empty sections → ask 3–5 questions → patch answers in
```

## Step 0 — Classify the subject

Pick the template by what the source actually is, not by its filename:

| Signal | Type |
| --- | --- |
| Markup fragment (starts at `<button>`, `<div>`…); one repeated UI pattern; imported by other units | **Component** → use component template |
| Full document (`<!doctype>`, `<head>`, `<body>`); lives in `pages/`, `views/`, `routes/`; multiple landmarks and a single `h1`; imports many units, imported by none | **Page** → use page template |
| Renders `{children}`, slots, or placeholder regions; lives in `layouts/`, `templates/`; defines grid/regions rather than content | **Template / Layout** → use layout template |

When genuinely ambiguous, say which type was chosen and why in one line, then
proceed — do not stall on the classification.

## Rule 1 — Draft immediately from source, before any questions

Generate the complete draft from the source alone, into the standard template for
the type. No questions first. The source already answers most of the template —
anatomy, props, variants, states, tokens are all in the code — and asking the user
things the code can tell you reads as not having done the work.

While drafting:

* Use only what the source supports. Preserve class names, prop names, custom
  properties and other technical names exactly as written.
* Extract React props from TypeScript interfaces, PropTypes, and default values;
  extract variants from prop unions and modifier classes; extract states from
  pseudo-classes, `disabled`/`aria-*` attributes, and conditional rendering.
* Use tables for structured facts (props, tokens, states) and code blocks for
  markup examples taken from the source.
* Write every template section heading, in order; a section the source gives no
  evidence for keeps its heading with an empty body (Rule 2).

## Rule 2 — Never invent; leave unknown sections empty

Never invent. Code cannot reveal intent, and intent is exactly what the most
valuable sections contain: when to use this vs. the alternative, Do/Don't
guidelines, content and tone rules, who a page is for.

Every section of the type's template is MANDATORY: always write the heading, in
the template's order. When the source (or explicit evidence — a comment, a
README line, a Figma description) gives nothing for a section, keep the heading
and leave its body completely empty — no placeholder text, no "Needs review"
marker, no commentary. An honest empty section is the signal; it becomes the
question list in Rule 3.

## Rule 3 — Ask 3–5 targeted questions, then patch answers in

After the draft is delivered, ask the user one short question per empty (or
thin) section — at most five, choosing the highest-value gaps if there are
more. Good questions are specific and answerable in a sentence:

* Component: "When should someone use Banner instead of Notification?" ·
  "Any hard rules for button labels?"
* Page: "Who is this page's primary user?" · "What must never appear above the fold?"
* Template: "Which page types is this layout intended for?" · "What is not allowed
  in the sidebar region?"

Handle answers by patching only the section each answer belongs to — do not
rewrite untouched sections. A skipped question leaves its section empty; that
is the honest state, not a failure. Never convert an answer into more than it
said: if the user gives one rule, write one rule.

The questions themselves NEVER appear inside the document — a saved .md
contains only the template sections. Append them AFTER the document as a final
section titled `## Open questions` — numbered, with 1-3 short plausible answers
as indented `-` bullets where suggestions help. This section is automatically
split out before saving and never reaches the file.

## Quality bar

The finished document must be valid Markdown starting with a single `#` title,
with no preamble, no commentary about the process, and no invented facts. A
reader should be able to tell instantly which statements came from source
(specific, exact names) and which still await a human (an empty section). That
contrast is the whole point of the method.
