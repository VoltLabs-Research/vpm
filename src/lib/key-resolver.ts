export interface ResolvedKey {
    username: string;
    name: string;
    fullName: string;
}

const SCOPE_RE = /^@([a-z0-9][a-z0-9-]*)\/([a-z0-9][a-z0-9._-]*)$/;
const LEGACY_RE = /^([a-z0-9][a-z0-9-]*)@([a-z0-9][a-z0-9._-]*)$/;

export const resolveKey = (input: string): ResolvedKey => {
    const trimmed = input.trim();
    const scoped = SCOPE_RE.exec(trimmed);
    if (scoped) {
        const username = scoped[1];
        const name = scoped[2];
        return { username, name, fullName: `@${username}/${name}` };
    }
    const legacy = LEGACY_RE.exec(trimmed);
    if (legacy) {
        const username = legacy[1];
        const name = legacy[2];
        return { username, name, fullName: `@${username}/${name}` };
    }
    throw new Error(
        `Invalid plugin reference '${input}'. Use '@username/name' or 'username@name'.`
    );
};

export const splitVersionSpec = (input: string): { ref: string; version?: string } => {
    if (input.startsWith('@')) {
        const at = input.indexOf('@', 1);
        if (at === -1) {
            return { ref: input };
        }
        return { ref: input.slice(0, at), version: input.slice(at + 1) || undefined };
    }
    const segments = input.split('@');
    if (segments.length === 2) {
        return { ref: input };
    }
    if (segments.length === 3) {
        return { ref: `${segments[0]}@${segments[1]}`, version: segments[2] || undefined };
    }
    return { ref: input };
};
