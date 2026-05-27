import { useMemo, useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type {
  AgentSkillListQuery,
  CreateAgentSkillInput,
  PublishAgentSkillInput,
  UpdateAgentSkillBindingsInput,
  ValidateAgentSkillInput,
} from "@u-build/shared";
import { agentSkillsApi } from "../../api/agentSkillsApi.js";

export interface AgentSkillFilters {
  search: string;
  status: "all" | NonNullable<AgentSkillListQuery["status"]>;
  sourceType: "all" | NonNullable<AgentSkillListQuery["sourceType"]>;
  agentProfileId: "all" | string;
}

const DEFAULT_FILTERS: AgentSkillFilters = {
  search: "",
  status: "all",
  sourceType: "all",
  agentProfileId: "all",
};

export function useAgentSkills() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<AgentSkillFilters>(DEFAULT_FILTERS);
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);

  const apiFilter = useMemo<AgentSkillListQuery>(() => {
    const next: AgentSkillListQuery = {};
    if (filters.search.trim()) next.search = filters.search.trim();
    if (filters.status !== "all") next.status = filters.status;
    if (filters.sourceType !== "all") next.sourceType = filters.sourceType;
    if (filters.agentProfileId !== "all") next.agentProfileId = filters.agentProfileId;
    return next;
  }, [filters]);

  const profilesQuery = useQuery({
    queryKey: ["agent-skills", "agent-profiles"],
    queryFn: () => agentSkillsApi.listAgentProfiles(),
    staleTime: 120_000,
  });

  const skillsQuery = useQuery({
    queryKey: ["agent-skills", "list", apiFilter],
    queryFn: () => agentSkillsApi.listSkills(apiFilter),
    staleTime: 12_000,
    refetchOnMount: "always",
  });

  const skills = skillsQuery.data ?? [];
  const effectiveSelectedSkillId = selectedSkillId ?? skills[0]?.id ?? null;
  const selectedSkill = skills.find((skill) => skill.id === effectiveSelectedSkillId);

  const detailQuery = useQuery({
    queryKey: ["agent-skills", "detail", effectiveSelectedSkillId],
    queryFn: () => agentSkillsApi.getSkill(effectiveSelectedSkillId ?? ""),
    enabled: Boolean(effectiveSelectedSkillId),
    staleTime: 8_000,
  });

  const invalidateSkills = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: ["agent-skills"] });
  };

  const createSkill = useMutation({
    mutationFn: (input: CreateAgentSkillInput) => agentSkillsApi.createSkill(input),
    onSuccess: async (result) => {
      setSelectedSkillId(result.skill.id);
      await invalidateSkills();
    },
  });

  const validateDraft = useMutation({
    mutationFn: (input: ValidateAgentSkillInput) =>
      agentSkillsApi.validateDraft(input),
  });

  const publishRevision = useMutation({
    mutationFn: ({
      skillId,
      revisionId,
      input,
    }: {
      skillId: string;
      revisionId: string;
      input: PublishAgentSkillInput;
    }) => agentSkillsApi.publishRevision(skillId, revisionId, input),
    onSuccess: async (result) => {
      setSelectedSkillId(result.skill.id);
      await invalidateSkills();
    },
  });

  const updateBindings = useMutation({
    mutationFn: ({
      skillId,
      input,
    }: {
      skillId: string;
      input: UpdateAgentSkillBindingsInput;
    }) => agentSkillsApi.updateBindings(skillId, input),
    onSuccess: invalidateSkills,
  });

  const archiveSkill = useMutation({
    mutationFn: (skillId: string) => agentSkillsApi.archiveSkill(skillId),
    onSuccess: async () => {
      setSelectedSkillId(null);
      await invalidateSkills();
    },
  });

  return {
    filters,
    setFilters,
    selectedSkillId: effectiveSelectedSkillId,
    setSelectedSkillId,
    skills,
    selectedSkill,
    selectedSkillDetail: detailQuery.data,
    profilesQuery,
    skillsQuery,
    detailQuery,
    createSkill,
    validateDraft,
    publishRevision,
    updateBindings,
    archiveSkill,
  };
}
