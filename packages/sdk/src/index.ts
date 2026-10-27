// MVP-02 qualification API only. Observation and storage APIs are not exposed.
export type { QualificationContext, QualificationEntry } from "./protocol";
import type { QualificationEntry } from "./protocol";
export const defineApplet = (entry: QualificationEntry): QualificationEntry => entry;
export const definePage = defineApplet;
