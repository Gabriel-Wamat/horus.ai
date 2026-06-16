# 👁️ Horus.AI - Project Context & AI Guidelines

## 🎯 Project Objective

**Horus.AI** is an autonomous multi-agent system designed to take a _User Story_, plan the specification, generate the frontend code (React/Node.js), write the corresponding tests, curate code quality, and ensure the initial requirements were met before rendering the result.

## 🛠️ Technology Stack

- **Language:** TypeScript
- **Agent Framework:** LangGraph
- **Target Ecosystem (Agent Output):** React, Node.js, Jest/Vitest.

## 🧠 Agent Architecture (StateGraph Flow)

The system operates through a cyclic state graph flow (StateGraph), where nodes represent agents and conditional edges determine routing based on validation.

### 1. Input

- **User Story:** The starting point. The user provides the desired functionality in natural language.

### 2. The Agents

- **1st Spec Agent:** \* **Role:** Requirements Analyst.
  - **Action:** Receives the User Story and generates a detailed Technical Specification (components, states, business rules, expected test cases).
- **2nd ODIN Agent (Orchestrator):** \* **Role:** Orchestrator and Router.
  - **Action (Forward):** Receives the Spec from the 1st Agent and routes the work in parallel to the Front and QA agents.
  - **Action (Return):** Receives the pass/fail verdict and feedback report from the Curator Agent. Based on the Curator's signal, it either triggers the refactoring flow (back to Front/QA) or finishes the execution.
- **Front Agent:** \* **Role:** Frontend Developer.
  - **Action:** Generates the component/page code in React/TypeScript based on the Spec.
- **QA Agent:** \* **Role:** Test Engineer.
  - **Action:** Generates automated tests based on the Spec.
  - _Note:_ Acts in parallel/synchronously with the Front Agent.
- **3rd Curator Agent:** \* **Role:** Code Reviewer and Specification Validator.
  - **Action:** Receives the generated code (Front Agent), the tests (QA Agent), and the original Spec. **Its main job is to perform the actual validation, comparing the generated outputs against the Spec.** It checks if all requirements were met, alongside syntax, cohesion, and test coverage. Finally, it sends a definitive "Pass/Fail" verdict and a detailed report back to ODIN.

### 3. Output

- **Call CLI / Render:** If the ODIN Agent receives a "Pass" verdict from the Curator, the cycle is broken (Conditional Edge), calling the CLI to expose/render the final web page.

---

## 🔄 Routing Flow (LangGraph Edges)

1. `START` -> `Spec Agent`
2. `Spec Agent` -> `ODIN Agent`
3. `ODIN Agent` -> `Front Agent` & `QA Agent` (Parallel Execution/Fan-out)
4. `Front Agent` & `QA Agent` -> `Curator Agent` (Fan-in / State Merge)
5. `Curator Agent` -> `ODIN Agent`
6. `ODIN Agent` -> **(Conditional Edge based on Curator's Verdict)**
   - _If `Curator Verdict == Fail`:_ Routes back to `Front Agent` & `QA Agent` (passing the Curator's feedback).
   - _If `Curator Verdict == Pass`:_ Routes to `Call CLI`.
7. `Call CLI` -> `END`

---

## 🤖 AI Instructions (You)

As an AI assisting in the development of `horus.ai`, you must:

1. **Focus on LangGraph + TypeScript:** When asked to write structural code for the project, use the official LangChain/LangGraph patterns for TS (e.g., `StateGraph`, `END`, definitions of `channels` and `reducers`).
2. **Maintain Strict Typing:** Define clear interfaces for the "State" that transitions between agents (e.g., `AgentState` containing `userStory`, `spec`, `frontCode`, `qaCode`, `curatorReport`, `isValidated`, `iterations`).
3. **Prevent Infinite Loops:** Whenever proposing implementations for the routing logic in the `ODIN Agent`, include a fallback mechanic or a maximum iteration limit (e.g., `max_retries = 3`) to prevent the flow from getting stuck in the validation loop if the agents cannot fulfill the Spec.
