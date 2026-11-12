import { GenesisError } from "../bridge.js";
import { ServiceError, type ServiceResponse } from "../types.js";
import type { Session } from "./session.js";

export interface Services {
  /** Calls the applet's backend service. Rejects with `ServiceError`. */
  request<T = unknown>(serviceId: string, path: string, options?: { method?: string; body?: unknown }): Promise<ServiceResponse<T>>;
}

export function createServices(session: Session): Services {
  return {
    async request<T>(serviceId: string, path: string, options: { method?: string; body?: unknown } = {}) {
      try {
        return await session.request<ServiceResponse<T>>("services.request", {
          serviceId, path, method: options.method ?? "GET", body: options.body ?? null,
        });
      } catch (error) {
        if (error instanceof GenesisError) throw new ServiceError(error.code, error.message);
        throw error;
      }
    },
  };
}
