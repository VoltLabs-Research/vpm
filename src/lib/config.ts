import { z } from 'zod';

const EnvSchema = z.object({
    VPM_REGISTRY: z.string().url().default('https://registry.voltcloud.dev'),
    VPM_CONSOLE: z.string().url().default('https://server.console.voltcloud.dev'),
    VOLT_CACHE_DIR: z.string().optional(),
    VPM_NO_KEYRING: z
        .string()
        .optional()
        .transform((value) => value === '1' || value === 'true')
});

export interface VpmConfig {
    registryUrl: string;
    consoleUrl: string;
    cacheDir?: string;
    noKeyring: boolean;
}

let overrides: Partial<VpmConfig> = {};

export const setConfigOverrides = (next: Partial<VpmConfig>): void => {
    overrides = { ...overrides, ...next };
};

export const getConfig = (): VpmConfig => {
    const parsed = EnvSchema.parse(process.env);
    return {
        registryUrl: overrides.registryUrl ?? parsed.VPM_REGISTRY,
        consoleUrl: overrides.consoleUrl ?? parsed.VPM_CONSOLE,
        cacheDir: overrides.cacheDir ?? parsed.VOLT_CACHE_DIR,
        noKeyring: overrides.noKeyring ?? parsed.VPM_NO_KEYRING
    };
};
