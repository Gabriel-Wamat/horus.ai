import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { v4 as uuidv4 } from "uuid";
import {
  LlmSettingsDraftSchema,
  LlmSettingsProfileSchema,
  type LlmProvider,
  type LlmSettings,
  type LlmSettingsDraft,
  type LlmSettingsProfile,
} from "@u-build/shared";
import { getDefaultBaseUrl } from "./providerConfig.js";

interface PersistedProfilesFile {
  defaultProfileId: string | null;
  profiles: LlmSettingsProfile[];
}

interface PersistedSecret {
  iv: string;
  tag: string;
  ciphertext: string;
}

interface PersistedSecretsFile {
  secrets: Record<string, PersistedSecret>;
}

export interface SaveLlmProfileInput extends LlmSettingsDraft {
  validationStatus?: LlmSettingsProfile["validationStatus"];
  validationMessage?: string;
  validatedAt?: string;
}

export interface ResolvedLlmProfile {
  profile: LlmSettingsProfile;
  settings: LlmSettings;
}

export interface LlmCredentialStore {
  listProviders(): Array<{
    provider: LlmProvider;
    label: string;
    defaultBaseUrl: string;
    supportsStructuredOutput: boolean;
    supportsResponsesApi: boolean;
    defaultModels: string[];
  }>;
  getDefaultProfile(): Promise<LlmSettingsProfile | null>;
  saveDefaultProfile(input: SaveLlmProfileInput): Promise<LlmSettingsProfile>;
  resolveDefaultProfile(): Promise<ResolvedLlmProfile | undefined>;
  resolveProfile(profileId: string): Promise<ResolvedLlmProfile>;
  deleteProfile(profileId: string): Promise<void>;
}

const PROVIDER_LABELS: Record<LlmProvider, string> = {
  openai: "OpenAI",
  openrouter: "OpenRouter",
  groq: "Groq",
};

const PROVIDER_MODELS: Record<LlmProvider, string[]> = {
  openai: ["gpt-5-mini", "gpt-4.1-mini"],
  openrouter: ["openai/gpt-4.1-mini", "anthropic/private-model-3.5-sonnet"],
  groq: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"],
};

export class LlmProfileNotFoundError extends Error {
  constructor(profileId: string) {
    super(`LLM profile "${profileId}" was not found.`);
    this.name = "LlmProfileNotFoundError";
  }
}

export class LlmProfileSecretMissingError extends Error {
  constructor(profileId: string) {
    super(`LLM profile "${profileId}" has no stored API key.`);
    this.name = "LlmProfileSecretMissingError";
  }
}

export class FileLlmCredentialStore implements LlmCredentialStore {
  private readonly dir: string;
  private readonly profilesPath: string;
  private readonly secretsPath: string;
  private readonly masterKeyPath: string;
  private readonly env: Record<string, string | undefined>;

  constructor(
    env: Record<string, string | undefined> = process.env,
    cwd = process.cwd()
  ) {
    this.env = env;
    const dataDir = env["HORUS_DATA_DIR"]?.trim() || path.resolve(cwd, ".horus/data");
    this.dir = path.join(dataDir, "llm");
    this.profilesPath = path.join(this.dir, "profiles.json");
    this.secretsPath = path.join(this.dir, "secrets.json");
    this.masterKeyPath = path.join(this.dir, "master.key");
  }

  listProviders(): ReturnType<LlmCredentialStore["listProviders"]> {
    return (["openai", "openrouter", "groq"] as const).map((provider) => ({
      provider,
      label: PROVIDER_LABELS[provider],
      defaultBaseUrl: getDefaultBaseUrl(provider),
      supportsStructuredOutput: true,
      supportsResponsesApi: provider === "openai",
      defaultModels: PROVIDER_MODELS[provider],
    }));
  }

  async getDefaultProfile(): Promise<LlmSettingsProfile | null> {
    const file = await this.readProfiles();
    return file.profiles.find((profile) => profile.id === file.defaultProfileId) ?? null;
  }

  async saveDefaultProfile(input: SaveLlmProfileInput): Promise<LlmSettingsProfile> {
    const draft = LlmSettingsDraftSchema.parse(input);
    const profiles = await this.readProfiles();
    const existing = profiles.profiles.find(
      (profile) => profile.id === profiles.defaultProfileId
    );
    if (!draft.apiKey && !existing) {
      throw new LlmProfileSecretMissingError("default");
    }

    const now = new Date().toISOString();
    const id = existing?.id ?? uuidv4();
    const apiKey = draft.apiKey;
    const baseUrl = draft.baseUrl ?? getDefaultBaseUrl(draft.provider);
    const priorKeyFields = existing
      ? {
          ...(existing.keyLast4 ? { keyLast4: existing.keyLast4 } : {}),
          ...(existing.keyFingerprint ? { keyFingerprint: existing.keyFingerprint } : {}),
        }
      : {};
    const keyFields = apiKey ? buildKeyFields(apiKey) : priorKeyFields;
    const profile = LlmSettingsProfileSchema.parse({
      id,
      provider: draft.provider,
      model: draft.model,
      baseUrl,
      ...keyFields,
      validationStatus: input.validationStatus ?? "untested",
      ...(input.validationMessage ? { validationMessage: input.validationMessage } : {}),
      ...(input.validatedAt ? { validatedAt: input.validatedAt } : {}),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });

    const nextProfiles = profiles.profiles.filter((item) => item.id !== id);
    nextProfiles.push(profile);
    await this.writeProfiles({ defaultProfileId: id, profiles: nextProfiles });

    if (apiKey) {
      const secrets = await this.readSecrets();
      secrets.secrets[id] = await this.encrypt(apiKey);
      await this.writeSecrets(secrets);
    }

    return profile;
  }

  async resolveDefaultProfile(): Promise<ResolvedLlmProfile | undefined> {
    const profile = await this.getDefaultProfile();
    if (!profile) return undefined;
    return this.resolveProfile(profile.id);
  }

  async resolveProfile(profileId: string): Promise<ResolvedLlmProfile> {
    const profiles = await this.readProfiles();
    const profile = profiles.profiles.find((item) => item.id === profileId);
    if (!profile) throw new LlmProfileNotFoundError(profileId);

    const secrets = await this.readSecrets();
    const secret = secrets.secrets[profile.id];
    if (!secret) throw new LlmProfileSecretMissingError(profile.id);

    return {
      profile,
      settings: {
        provider: profile.provider,
        model: profile.model,
        apiKey: await this.decrypt(secret),
        baseUrl: profile.baseUrl,
      },
    };
  }

  async deleteProfile(profileId: string): Promise<void> {
    const profiles = await this.readProfiles();
    const nextProfiles = profiles.profiles.filter((profile) => profile.id !== profileId);
    const nextDefault =
      profiles.defaultProfileId === profileId ? null : profiles.defaultProfileId;
    await this.writeProfiles({
      defaultProfileId: nextDefault,
      profiles: nextProfiles,
    });
    const secrets = await this.readSecrets();
    delete secrets.secrets[profileId];
    await this.writeSecrets(secrets);
  }

  private async readProfiles(): Promise<PersistedProfilesFile> {
    await this.ensureDir();
    try {
      const raw = await fs.readFile(this.profilesPath, "utf8");
      const parsed = JSON.parse(raw) as PersistedProfilesFile;
      return {
        defaultProfileId: parsed.defaultProfileId ?? null,
        profiles: (parsed.profiles ?? []).map((profile) =>
          LlmSettingsProfileSchema.parse(profile)
        ),
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { defaultProfileId: null, profiles: [] };
      }
      throw error;
    }
  }

  private async writeProfiles(file: PersistedProfilesFile): Promise<void> {
    await this.writeJsonAtomic(this.profilesPath, file);
  }

  private async readSecrets(): Promise<PersistedSecretsFile> {
    await this.ensureDir();
    try {
      const raw = await fs.readFile(this.secretsPath, "utf8");
      const parsed = JSON.parse(raw) as PersistedSecretsFile;
      return { secrets: parsed.secrets ?? {} };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { secrets: {} };
      }
      throw error;
    }
  }

  private async writeSecrets(file: PersistedSecretsFile): Promise<void> {
    await this.writeJsonAtomic(this.secretsPath, file);
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true, mode: 0o700 });
  }

  private async writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
    await this.ensureDir();
    const tmp = `${filePath}.tmp-${process.pid}-${crypto.randomUUID()}`;
    await fs.writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, {
      mode: 0o600,
    });
    await fs.rename(tmp, filePath);
  }

  private async encrypt(value: string): Promise<PersistedSecret> {
    const key = await this.loadEncryptionKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(value, "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return {
      iv: iv.toString("base64"),
      tag: tag.toString("base64"),
      ciphertext: ciphertext.toString("base64"),
    };
  }

  private async decrypt(secret: PersistedSecret): Promise<string> {
    const key = await this.loadEncryptionKey();
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(secret.iv, "base64")
    );
    decipher.setAuthTag(Buffer.from(secret.tag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(secret.ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
  }

  private async loadEncryptionKey(): Promise<Buffer> {
    await this.ensureDir();
    const envSecret = this.env["HORUS_SECRET_KEY"]?.trim();
    if (envSecret) return crypto.createHash("sha256").update(envSecret).digest();

    try {
      const raw = await fs.readFile(this.masterKeyPath, "utf8");
      return crypto.createHash("sha256").update(raw.trim()).digest();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const generated = crypto.randomBytes(32).toString("hex");
      await fs.writeFile(this.masterKeyPath, `${generated}\n`, { mode: 0o600 });
      return crypto.createHash("sha256").update(generated).digest();
    }
  }
}

function buildKeyFields(apiKey: string): {
  keyLast4: string;
  keyFingerprint: string;
} {
  return {
    keyLast4: apiKey.slice(-4),
    keyFingerprint: crypto.createHash("sha256").update(apiKey).digest("hex").slice(0, 16),
  };
}
