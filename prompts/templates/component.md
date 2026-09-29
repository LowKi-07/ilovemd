# Component documentation template

This documentation serves the reader who must USE the component well - it leads
with design principles, usage guidance and business purpose, and keeps technical
detail to the minimum that supports those. It is not an implementation reference.

Use EXACTLY these sections, in this order, and no others. EVERY section is
mandatory: always write the heading; when the source (or a human) gives nothing
for it, leave the body completely empty - no placeholder, no marker, never an
invention. ⚑ = human-knowledge section: expect to fill it from the human's
answers, not from code.

```markdown
# <ComponentName>

## Purpose ⚑        ← one or two sentences: what this component is and when to use it.
                      Business/UX intent, not implementation.
## Variants          ← "- <Variant> - when to use it." One bullet per variant. Variant
                      names come from source; the when-to-use half is ⚑ unless obvious.
## States            ← "- <State> - what it communicates or when it appears." From source
                      (hover, focus, disabled, loading...). No CSS values.
## Anatomy           ← "- <Element> - what it is for." Plain part names a designer would
                      use, not selectors or class names.
## Dependencies      ← two subsections, only what actually applies:
                      "### Components" - other components this one uses (by name).
                      "### Tokens" - "- Colour: <token>" / "- Spacing: <token>" - token
                      NAMES exactly as in source, never their resolved values.
## Behaviour         ← rules of interaction: how it responds, what is allowed or blocked.
                      Plain sentences, one rule per bullet.
## Actions           ← "- <Action> does <what>." User-triggered actions and their results.
                      Omit for purely presentational components.
## Accessibility     ← what is communicated programmatically (role, state exposure),
                      keyboard behaviour. From source, plus ⚑ guidance beyond the code.
## Do / Don't ⚑      ← short imperative rules: "- Do - ..." / "- Don't - ..."
```

Explicitly AVOID: Overview essays, props/API tables, code examples, markup
snippets, CSS dumps, pixel or colour values, exhaustive token-value tables,
Sizes as a standalone section (fold into Variants when sizes carry meaning),
Examples, Notes. If a technical fact does not change how someone would USE the
component, it does not belong here.

Question bank for Rule 3 (pick the 3-5 that match this component's gaps):

* "In one sentence, what is this component for, and when should someone reach for it instead of <its closest sibling>?"
* "For each variant: when is it the right choice?"
* "What business rules govern it?" (e.g. when it must be disabled, what it must never show)
* "What are the hard Do / Don't rules you want recorded?"
* "Anything assistive-technology users need beyond what the code shows?"
