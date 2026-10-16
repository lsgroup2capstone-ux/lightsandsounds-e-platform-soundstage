import { appStorage } from "./app-store"
import { SERVICE_RATINGS_KEY, type ServiceRatings } from "./service-ratings"

export function getServiceRatings(): ServiceRatings {
  try {
    const value = JSON.parse(appStorage.getItem(SERVICE_RATINGS_KEY) || "{}")
    return value && typeof value === "object" && !Array.isArray(value) ? value : {}
  } catch {
    return {}
  }
}
