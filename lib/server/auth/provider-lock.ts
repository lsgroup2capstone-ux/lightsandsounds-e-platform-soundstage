import { RequestError } from "../request-error"

// Actions an unapproved provider needs to submit (or resubmit) their application.
export const UNAPPROVED_PROVIDER_ACTIONS = new Set(["submitProviderApplication", "createUploadUrl", "getProviderDocumentUrl", "setNotificationReads"])
export const AWAITING_VERIFICATION = "Your provider account is awaiting verification."

export function assertProviderActionAllowed(role: string, approved: boolean, action: string | undefined, args: unknown[] = []) {
  if (role !== "provider" || !action || approved) return
  if (!UNAPPROVED_PROVIDER_ACTIONS.has(action)) throw new RequestError(AWAITING_VERIFICATION, 403)
  if (action === "createUploadUrl" && args[0] !== "provider-document") throw new RequestError(AWAITING_VERIFICATION, 403)
}
