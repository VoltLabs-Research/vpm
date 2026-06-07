import { z } from 'zod';

export type PackageKind = 'workflow' | 'engine' | 'lib';

export const PackageKindSchema = z.enum(['workflow', 'engine', 'lib']);

export const RepositorySchema = z.object({
    type: z.string(),
    url: z.string()
});

export const EntrypointsSchema = z.object({
    binary: z.string().optional(),
    workflow: z.string().optional()
});

export const VpmManifestSchema = z.object({
    name: z.string().regex(/^@[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9._-]*$/, 'name must be @username/name'),
    version: z.string(),
    kind: PackageKindSchema,
    description: z.string().optional(),
    publisher: z.string(),
    license: z.string().optional(),
    homepage: z.string().optional(),
    repository: RepositorySchema.optional(),
    keywords: z.array(z.string()).optional(),
    entrypoints: EntrypointsSchema.optional(),
    nodeTypes: z.array(z.string()).optional(),
    platforms: z.array(z.string()).optional(),
    voltsdk: z.string().optional(),
    coretoolkit: z.string().optional(),
    files: z.array(z.string()).optional()
});

export type VpmManifest = z.infer<typeof VpmManifestSchema>;

export interface PlatformAsset {
    tag: string;
    sha256: string;
    key: string;
    sizeBytes: number;
}

export interface DeprecationInfo {
    reason: string;
    at: string;
}

export interface VersionMetadata {
    version: string;
    manifest: VpmManifest;
    sha256: string;
    sigEd25519?: string;
    sizeBytes: number;
    publishedAt: string;
    publishedBy: string;
    platforms: PlatformAsset[];
    deprecated?: DeprecationInfo;
}

export interface Packument {
    fullName: string;
    username: string;
    name: string;
    kind: PackageKind;
    description?: string;
    keywords?: string[];
    homepage?: string;
    repository?: { type: string; url: string };
    distTags: Record<string, string>;
    versions: Record<string, VersionMetadata>;
    downloads: { total: number; last30d: number };
    createdAt: string;
    updatedAt: string;
}

export interface PackumentSummary {
    fullName: string;
    username: string;
    name: string;
    kind: PackageKind;
    description?: string;
    keywords?: string[];
    latest?: string;
    downloads: { total: number; last30d: number };
    activity?: number[];
    verified?: boolean;
    updatedAt: string;
}

export interface SearchResult {
    items: PackumentSummary[];
    page: number;
    total: number;
}

export interface BundleRef {
    publisher: string;
    key: string;
    version: string;
    platform: string;
}

export interface AuthTokens {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    tokenType: 'Bearer';
}

export interface StoredCredentials {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    pat?: string;
    accountId?: string;
    email?: string;
}

export interface DeviceCodeStart {
    deviceCode: string;
    userCode: string;
    verificationUri: string;
    interval: number;
    expiresIn: number;
}

export interface WhoamiResponse {
    accountId: string;
    email: string;
    username: string;
}

export interface PatRecord {
    id: string;
    label: string;
    scopes: string[];
    scopeMask: number;
    lastUsedAt?: string;
    expiresAt?: string;
    createdAt: string;
}

export interface PatCreateResponse extends PatRecord {
    token: string;
}
