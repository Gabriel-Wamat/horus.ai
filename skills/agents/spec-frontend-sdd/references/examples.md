# Frontend Spec Examples

## Good Component Description

```yaml
name: "StoryFolderRail"
type: "ui"
description: "Left navigation rail that lists workspace folders and their stories, supports selected, empty, and loading states, and exposes stable labels for QA."
dependencies:
  - "WorkspaceFolderModel"
```

Why it is good:

- names a real product responsibility;
- includes states;
- tells QA what should be visible;
- declares dependency.

## Weak Component Description

```yaml
name: "CardSection"
type: "ui"
description: "Displays cards."
dependencies: []
```

Why it is weak:

- generic name;
- no product purpose;
- no states, interactions, or validation surface.

## Good Future Route Contract

```yaml
method: "GET"
path: "/api/workspace/folders"
description: "Future contract for loading workspace folders used by the folder rail; current static artifact must use a mock adapter with this same response shape."
requestSchema: {}
responseSchema:
  folders:
    - id: "string"
      name: "string"
      storyCount: "number"
      updatedAt: "string"
```

## Good Acceptance Criterion

```text
The interface renders loading, empty, error, and populated states for the folder list without layout shift, using the same data shape expected from GET /api/workspace/folders.
```
