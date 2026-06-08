export interface ResolvedKey {
    username: string;
    name: string;
    fullName: string;
}

const SCOPE_RE = /^@([a-z0-9][a-z0-9-]*)\/([a-z0-9][a-z0-9._-]*)$/;

export const resolveKey = (input: string): ResolvedKey => {
    const scoped = SCOPE_RE.exec(input.trim());
    if (scoped) {
        const username = scoped[1];
        const name = scoped[2];
        return { username, name, fullName: `@${username}/${name}` };
    }
    throw new Error(`Invalid plugin reference '${input}'. Use '@username/name'.`);
};

export const splitVersionSpec = (input: string): { ref: string; version?: string } => {
    if (!input.startsWith('@')) {
        return { ref: input };
    }
    const at = input.indexOf('@', 1);
    if (at === -1) {
        return { ref: input };
    }
    return { ref: input.slice(0, at), version: input.slice(at + 1) || undefined };
};
