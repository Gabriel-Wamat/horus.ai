import type { WelcomeContent } from "../types";

export const welcomeContent: WelcomeContent = {
  projectName: "project-manager-ui-generation",
  title: "Workspace pronto para construção",
  description:
    "O Horus criou uma aplicação React/TypeScript modular. As próximas alterações dos agentes devem editar componentes, estilos e contratos reais deste projeto.",
  actions: [
    { label: "Ver projeto", intent: "primary" },
    { label: "Abrir arquivos", intent: "secondary" },
  ],
};
