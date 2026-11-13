import type { NotificationInput, NotificationResult } from "@genesis/core";
import type { Session } from "./session.js";

export interface Notifications {
  /**
   * Notifies the user, when the manifest declares `capabilities.notifications`. `posted` means
   * Genesis accepted it; it shows only if the user turned the applet's notifications on.
   */
  post(input: NotificationInput): Promise<NotificationResult>;
}

export function createNotifications(session: Session): Notifications {
  return {
    post: input => session.request<NotificationResult>("notifications.post", { ...input }),
  };
}
