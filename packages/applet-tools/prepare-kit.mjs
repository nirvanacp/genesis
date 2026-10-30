import { cp, rm, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const output = fileURLToPath(new URL('./kit/', import.meta.url));
const source = fileURLToPath(new URL('../../factory/', import.meta.url));
await rm(output, { recursive: true, force: true }); await mkdir(output);
for (const name of ['AGENTS.md','README.md','guides','skills']) await cp(path.join(source, name), path.join(output, name), { recursive: true });
