/**
 * Exemplo: como conectar tudo na criação do app.
 */

import { createApp } from "./infrastructure/http/server.js";
import { SpecAgentImpl } from "./infrastructure/agents/SpecAgentImpl.js";
import { OdinAgentImpl } from "./infrastructure/agents/OdinAgentImpl.js";
import { FrontAgentImpl } from "./infrastructure/agents/FrontAgentImpl.js";
import { QaAgentImpl } from "./infrastructure/agents/QaAgentImpl.js";
import { CuratorAgentImpl } from "./infrastructure/agents/CuratorAgentImpl.js";
import {
  agentRegistry,
  createSpecAgentNode,
} from "./infrastructure/langgraph/nodes/INJECTION_EXAMPLES.js";

// ─────────────────────────────────────────────────────────────────────────

// PASSO 1: criar instâncias concretas dos agentes (implementações de IAgentProvider)
const specAgent = new SpecAgentImpl();
const odinAgent = new OdinAgentImpl();
const frontAgent = new FrontAgentImpl();
const qaAgent = new QaAgentImpl();
const curatorAgent = new CuratorAgentImpl();

// PASSO 2: registrar globalmente (opção 2 de DI acima)
agentRegistry.spec = specAgent;
agentRegistry.odin = odinAgent;
agentRegistry.front = frontAgent;
agentRegistry.qa = qaAgent;
agentRegistry.curator = curatorAgent;

// PASSO 3: criar o app como de costume
const app = createApp();

// Ou, alternativa (opção 1): passar os agentes injetados ao grafo
// const specAgentNode = createSpecAgentNode(specAgent);
// const graph = buildGraphWithInjectedNodes(specAgentNode, odinAgentNode, ...);
