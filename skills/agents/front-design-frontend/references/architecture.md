# Front Skill Architecture Notes

- The Front Agent produces a single static artifact, not a project scaffold.
- The artifact must be complete HTML with embedded CSS and JavaScript.
- The source of truth is the approved spec plus curator feedback on retries.
- The output is consumed by the Curator and by artifact download/preview flows.
- No provider SDK, backend, or workflow state concerns belong in this skill.
