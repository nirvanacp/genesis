import { GenesisError, type AppletContext } from "@genesis/sdk";

/** Public applet preferences/drafts only; bookmarks remain on their declared service. */
export async function writeLocal(context: AppletContext, collection: string, key: string, value: unknown): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { document } = await context.storage.get(collection, key);
    try {
      await context.storage.commit({ checks: [{ collection, key, expectedRevision: document?.revision ?? null }], puts: [{ collection, key, value }], deletes: [] });
      return;
    } catch (error) { if (!(error instanceof GenesisError) || error.code !== "CONFLICT" || attempt === 2) throw error; }
  }
}
