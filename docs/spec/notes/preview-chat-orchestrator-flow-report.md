# Preview Chat -> Horus/Odin Flow Report

Date: 2026-05-26

## Current Flow Reading

The current system has three separate execution surfaces:

1. **User Stories / Specs**
   - The user creates user stories inside workspace folders.
   - Each user story is stored in its own directory with revisioned artifacts.
   - The workflow starts from user stories and runs through Spec Agent, Odin routing, Front Agent, QA Agent, Curator Agent, and possible retry loops.

2. **Preview Runtime**
   - The preview screen selects a frontend project, creates a preview session, starts/stops/reloads it, and renders the frontend in an iframe.
   - Preview state is isolated by `projectId` and `previewSessionId`.
   - The current chat-like composer still creates preview instruction drafts, but it does not yet talk to Horus/Odin.

3. **Chat Memory**
   - Chat sessions already exist in the backend and are scoped to `workspaceFolderId` and `userStoryId`.
   - Every message stores a context snapshot with active story/spec revision ids and optional workflow thread id.
   - Agent context can already return chat history, active story, active spec, artifact context, and previous agent outputs.

## Updated Architecture Intent From Image

The preview chat must communicate with **Horus/Odin**, not directly with the Spec Agent.

This matters because a normal chat message is not necessarily a user story. If every user message goes through the Spec Agent, the system will generate unnecessary specs for ordinary requests like:

- "what does this file do?"
- "run the project"
- "make the button smaller"
- "why is this screen blank?"

The correct flow is:

1. User sends a message in the preview chat.
2. Horus/Odin receives the message with isolated chat memory, active preview project, active workspace/story context when selected, and allowed code-folder context.
3. Horus/Odin classifies the intent.
4. Horus/Odin chooses one of these actions:
   - answer using chat memory and isolated code context;
   - execute/start/reload/stop the project through preview/runtime tools;
   - route a code-change request to the correct downstream agents;
   - generate or update a spec only when the user explicitly asks for spec work.
5. Agent outputs return to the same chat session and never leak to other chats, folders, stories, or projects.

## Non-Negotiable Isolation Rule

Every chat turn must be scoped by explicit identifiers:

- `chatSessionId`
- `previewSessionId` when the preview is involved
- `projectId` for frontend/code execution
- `workspaceFolderId` and `userStoryId` only when a story context is intentionally attached
- `workflowThreadId` only when continuing an existing workflow

No handler may infer context from global mutable state, latest workflow, latest preview, or a different folder/project.

