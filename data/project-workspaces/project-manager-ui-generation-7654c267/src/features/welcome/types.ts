export interface WelcomeAction {
  label: string;
  intent: "primary" | "secondary";
}

export interface WelcomeContent {
  projectName: string;
  title: string;
  description: string;
  actions: WelcomeAction[];
}
