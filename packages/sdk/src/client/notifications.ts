import { USER_ACTION_DEADLINE_MS, type NotificationInput, type NotificationResult } from "@genesis/core";
import type { Session } from "./session.js";

export interface Notifications {
  /**
   * Notifies the user, when the manifest declares `capabilities.notifications`. `posted` means
   * Genesis accepted it; it shows only if the user turned the applet's notifications on.
   */
  post(input: NotificationInput): Promise<NotificationResult>;
  /**
   * Turns the applet's notifications on, asking Android for permission when needed; resolves with
   * whether they are on. Needs a tap on the applet UI in the last 3 seconds, like the user actions.
   */
  enable(): Promise<boolean>;
}

export function createNotifications(session: Session): Notifications {
  return {
    post: input => session.request<NotificationResult>("notifications.post", { ...input }),
    enable: () =>
      session.request<{ enabled: boolean }>("notifications.enable", {}, { timeoutMs: USER_ACTION_DEADLINE_MS }).then(({ enabled }) => enabled),
  };
}
