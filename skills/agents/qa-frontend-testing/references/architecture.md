# QA Skill Architecture Notes

- The QA Agent produces structured test cases, not executable test files.
- Test cases are consumed by the Curator and exported as artifacts.
- The source of truth is the approved spec plus curator feedback on retries.
- QA must evaluate the frontend as a user-facing browser artifact.
- Backend, provider, and storage concerns are out of scope.
