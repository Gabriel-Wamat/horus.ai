import { useMemo, useState, type JSX } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Plus, RefreshCw } from "lucide-react";
import { Button } from "../../components/ui/index.js";
import { SkillBuilder } from "./SkillBuilder.js";
import { SkillCatalog } from "./SkillCatalog.js";
import { SkillDetailPanel } from "./SkillDetailPanel.js";
import { useAgentSkills } from "./useAgentSkills.js";
import "./styles/agent-skills.css";

const agentSkillsQueryClient = new QueryClient();

export function AgentSkillsPage(): JSX.Element {
  return (
    <QueryClientProvider client={agentSkillsQueryClient}>
      <AgentSkillsPageContent />
    </QueryClientProvider>
  );
}

function AgentSkillsPageContent(): JSX.Element {
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const state = useAgentSkills();
  const profiles = state.profilesQuery.data ?? [];
  const pageError = useMemo(
    () =>
      firstErrorMessage([
        state.skillsQuery.error,
        state.profilesQuery.error,
        state.detailQuery.error,
      ]),
    [state.skillsQuery.error, state.profilesQuery.error, state.detailQuery.error]
  );
  const builderError = firstErrorMessage([
    state.validateDraft.error,
    state.createSkill.error,
    state.publishRevision.error,
  ]);

  return (
    <div className="agent-skills-page">
      <header className="agent-skills-page-head">
        <div>
          <p className="panel-kicker">Project capabilities</p>
          <h1>Skills</h1>
          <p>
            Playbooks versionados que Horus pode validar, publicar e carregar por
            agente.
          </p>
        </div>
        <div className="agent-skills-page-actions">
          <button
            type="button"
            className="panel-action"
            title="Recarregar skills"
            onClick={() => {
              void state.skillsQuery.refetch();
              void state.profilesQuery.refetch();
              void state.detailQuery.refetch();
            }}
          >
            <RefreshCw size={15} aria-hidden="true" />
            Recarregar
          </button>
          <Button onClick={() => setIsBuilderOpen(true)} leadingIcon={<Plus size={16} />}>
            Nova skill
          </Button>
        </div>
      </header>

      <div className="agent-skills-layout">
        <SkillCatalog
          skills={state.skills}
          profiles={profiles}
          filters={state.filters}
          selectedSkillId={state.selectedSkillId}
          isLoading={state.skillsQuery.isLoading || state.profilesQuery.isLoading}
          error={
            state.skillsQuery.error || state.profilesQuery.error ? pageError : null
          }
          onChangeFilters={state.setFilters}
          onSelectSkill={state.setSelectedSkillId}
          onRetry={() => {
            void state.skillsQuery.refetch();
            void state.profilesQuery.refetch();
          }}
        />
        <SkillDetailPanel
          skill={state.selectedSkill}
          detail={state.selectedSkillDetail}
          profiles={profiles}
          isLoading={state.detailQuery.isLoading || state.detailQuery.isFetching}
          error={state.detailQuery.error ? pageError : null}
          isPublishing={state.publishRevision.isPending}
          isArchiving={state.archiveSkill.isPending}
          onPublishRevision={(revisionId, expectedRevisionHash) => {
            if (!state.selectedSkillId) return;
            state.publishRevision.mutate({
              skillId: state.selectedSkillId,
              revisionId,
              input: { expectedRevisionHash },
            });
          }}
          onArchiveSkill={(skillId) => state.archiveSkill.mutate(skillId)}
        />
      </div>

      <SkillBuilder
        isOpen={isBuilderOpen}
        profiles={profiles}
        isCreating={state.createSkill.isPending}
        isValidating={state.validateDraft.isPending}
        isPublishing={state.publishRevision.isPending}
        error={builderError}
        onClose={() => setIsBuilderOpen(false)}
        onValidate={(input) => state.validateDraft.mutateAsync(input)}
        onCreate={(input) => state.createSkill.mutateAsync(input)}
        onPublish={(skillId, revisionId, expectedRevisionHash) =>
          state.publishRevision.mutateAsync({
            skillId,
            revisionId,
            input: { expectedRevisionHash },
          })
        }
      />
    </div>
  );
}

function firstErrorMessage(errors: Array<unknown>): string | null {
  const error = errors.find(Boolean);
  if (!error) return null;
  return error instanceof Error ? error.message : String(error);
}
