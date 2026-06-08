# QA Skill Architecture Notes

- The QA Agent produces structured test cases, not executable test files.
- Test cases are consumed by the Curator and exported as artifacts.
- The source of truth is the approved spec plus curator feedback on retries.
- QA must evaluate the frontend as a user-facing browser artifact.
- Real backend, provider, and storage implementation concerns are out of scope.
- Future backend contracts in `apiEndpoints` are in scope as frontend readiness checks.
- Route-readiness tests must validate adapter-compatible local state, loading/error/empty states, and response-shape compatibility without assuming a live endpoint exists.
- Data models in the spec should appear in tests as visible fields, formatting expectations, fallback behavior, or state transitions.
