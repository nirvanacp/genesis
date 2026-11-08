import type { Limits, Page, PageRecord, Patch, RegionPatch } from "@genesis/core";
import { GenesisError } from "../bridge.js";
import { diffRegion } from "./diff.js";

/** A page as the runtime reads it; the publisher adds the epoch. */
export type PageContent = Omit<Page, "epoch">;

type Send = (params: { page: Page } | { patch: Patch }) => Promise<unknown>;

const encoder = new TextEncoder();
const bytes = (value: unknown) => encoder.encode(JSON.stringify(value)).length;

/**
 * The document's one outgoing queue. A full page starts a new epoch and resets `seq` to 0; every
 * later change of the same view goes out as patches that extend it. Requests leave in order, so
 * the host and the foreground see them in `seq` order.
 */
export class Publisher {
  private epoch = 0;
  private seq = 0;
  private last: Page | null = null;

  constructor(private readonly send: Send, private readonly limits: Limits) {}

  /** Publishes `content` as a full page. */
  page(content: PageContent) {
    let page: Page = { ...content, epoch: ++this.epoch };
    if (bytes(page) > this.limits.pageMaxBytes) {
      page = { ...page, status: "error", error: { code: "PAGE_TOO_LARGE", message: "The page is too large to show" }, regions: {} };
    }
    this.seq = 0;
    this.last = page;
    this.post({ page });
  }

  /**
   * Publishes what changed since the last page or patch: nothing, patches, or a full page when
   * the view, the status or the region set changed or the patch would not fit.
   */
  update(content: PageContent) {
    const last = this.last;
    if (!last || !samePage(last, content)) return this.page(content);
    const regions: { [name: string]: RegionPatch } = {};
    for (const [name, region] of Object.entries(content.regions)) {
      const patch = diffRegion(last.regions[name], region);
      if (patch) regions[name] = patch;
    }
    // A page that stops showing the account (undefined) is no change to report.
    const account = content.account !== undefined && content.account !== last.account;
    if (!account && Object.keys(regions).length === 0) return;
    const patches = this.split(regions);
    if (account) patches[patches.length - 1].account = content.account;
    if (patches.some(patch => bytes(patch) > this.limits.patchMaxBytes)) return this.page(content);
    this.last = { ...content, epoch: this.epoch };
    for (const patch of patches) this.post({ patch });
  }

  /**
   * Splits one batch's patch so each carries at most `patchRecordsMax` upserts and stays under
   * `patchMaxBytes`. Only the last one carries order, removals and the other fields, so the
   * store sees a region's new order only once every record it names has arrived.
   */
  private split(regions: { [name: string]: RegionPatch }): Patch[] {
    const upserts: [string, PageRecord][] = [];
    const rest: { [name: string]: RegionPatch } = {};
    for (const [name, patch] of Object.entries(regions)) {
      if (patch.kind !== "collection" || !patch.upsert) {
        rest[name] = patch;
        continue;
      }
      const { upsert, ...others } = patch;
      for (const record of upsert) upserts.push([name, record]);
      if (Object.keys(others).length > 1) rest[name] = others;
    }
    const budget = this.limits.patchMaxBytes - bytes(rest) - 256;
    const chunks: [string, PageRecord][][] = [];
    let chunk: [string, PageRecord][] = [];
    let size = 0;
    for (const item of upserts) {
      const itemSize = bytes(item[1]) + 1;
      if (chunk.length && (chunk.length >= this.limits.patchRecordsMax || size + itemSize > budget)) {
        chunks.push(chunk);
        chunk = [];
        size = 0;
      }
      chunk.push(item);
      size += itemSize;
    }
    chunks.push(chunk);

    const view = this.last!.view;
    return chunks.map((records, i) => {
      const patch: Patch = { view, epoch: this.epoch, base: this.seq, seq: ++this.seq, regions: {} };
      for (const [name, record] of records) {
        const region = (patch.regions[name] ??= { kind: "collection", upsert: [] }) as Extract<RegionPatch, { kind: "collection" }>;
        region.upsert!.push(record);
      }
      if (i === chunks.length - 1) {
        for (const [name, other] of Object.entries(rest)) patch.regions[name] = { ...patch.regions[name], ...other } as RegionPatch;
      }
      return patch;
    });
  }

  private post(params: { page: Page } | { patch: Patch }) {
    this.send(params).catch((error: unknown) => {
      const code = error instanceof GenesisError ? error.code : null;
      if (code === "RETIRED") return;
      // A patch the host refused leaves the foreground behind; a full page catches it up.
      if ("patch" in params && this.last && params.patch.epoch === this.epoch) {
        const { epoch: _epoch, ...content } = this.last;
        return this.page(content);
      }
      if ("page" in params && code === "PAGE_TOO_LARGE" && params.page.status !== "error") {
        const { epoch: _epoch, ...content } = params.page;
        return this.page({ ...content, status: "error", error: { code, message: "The page is too large to show" }, regions: {} });
      }
      console.error("Genesis could not publish the page", error);
    });
  }
}

/** True when a patch can carry the change from `last` to `content`. */
function samePage(last: Page, content: PageContent): boolean {
  const names = Object.keys(content.regions);
  return last.view.generation === content.view.generation && last.view.n === content.view.n && last.view.url === content.view.url
    && last.status === content.status && last.pageId === content.pageId && last.routeId === content.routeId
    && last.error?.code === content.error?.code && last.error?.message === content.error?.message
    && last.signInUrl === content.signInUrl
    && JSON.stringify(last.params) === JSON.stringify(content.params)
    && names.length === Object.keys(last.regions).length
    && names.every(name => last.regions[name]?.kind === content.regions[name].kind);
}

/**
 * Runs `flush` once changes stop for `quietMs`, and at the latest `maxDelayMs` after the first
 * change it has not flushed yet, however busy the page stays.
 */
export function debounce(flush: () => void, quietMs: number, maxDelayMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let first: number | undefined;
  const run = () => {
    clearTimeout(timer);
    timer = undefined;
    first = undefined;
    flush();
  };
  return {
    schedule() {
      const now = Date.now();
      first ??= now;
      clearTimeout(timer);
      timer = setTimeout(run, Math.min(quietMs, Math.max(0, first + maxDelayMs - now)));
    },
    /** Runs a scheduled flush now. */
    now() { if (timer !== undefined) run(); },
    cancel() {
      clearTimeout(timer);
      timer = undefined;
      first = undefined;
    },
  };
}
