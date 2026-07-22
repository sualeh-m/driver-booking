---
name: Radix Select ignores post-mount value changes
description: Why edit forms must seed react-hook-form values BEFORE mounting a Radix/shadcn Select
---

Rule: when an edit form contains a Radix/shadcn `Select`, seed the form (`form.reset(values)`) synchronously in the click handler BEFORE flipping the state that mounts the form — never in a `useEffect` that runs after the Select has mounted.

**Why:** A controlled Radix Select whose `value` prop changes after mount, before the dropdown has ever been opened, keeps showing its placeholder (the item text isn't registered yet). Text inputs pre-fill fine, so the bug looks like "only the dropdown lost its value" — a real bug hit in the worker profile Edit form.

**How to apply:** In view→edit dialogs, do `form.reset({...fetched values}); setEditing(true);` in the Edit button handler. Verify with an e2e test that the select shows the existing value pre-selected on first render of edit mode.
