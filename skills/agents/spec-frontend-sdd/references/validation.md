# Frontend Spec Validation Reference

The Spec Agent does not run validation itself during structured LLM output, but it must generate specs that make validation possible.

## Minimum Validation Surfaces

A generated spec should let QA validate:

- every acceptance criterion;
- primary user journey;
- interactive controls;
- loading, empty, error, and success states when data/forms exist;
- responsive layout;
- accessibility basics;
- future API contract compatibility when route contracts exist.

## Validation-Ready Wording

Prefer:

```text
Submitting an invalid form keeps the layout stable, marks invalid fields with accessible text, and does not call the data adapter.
```

Avoid:

```text
The form should work well.
```
