const BASE_OUT_OF_AREA_FEE = 1000

const TOWN_CONNECTIONS: Record<string, string[]> = {
  balayan: ["calaca", "calatagan", "tuy"],
  calaca: ["balayan", "lemery"],
  calatagan: ["balayan", "lian"],
  lemery: ["calaca"],
  lian: ["calatagan", "nasugbu", "tuy"],
  nasugbu: ["lian", "tuy"],
  tuy: ["balayan", "lian", "nasugbu"],
}

export function isAreaCovered(eventArea: string, coveredAreas: string) {
  const event = normalizeTown(eventArea)
  return coveredAreas.split(/[,;\n]/).some((area) => {
    const covered = normalizeTown(area)
    return Boolean(event && covered && event === covered)
  })
}

function normalizeTown(value: string) {
  return value.split(",")[0].toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").replace(/\b(city|municipality|town)\b/g, "").replace(/\s+/g, " ").trim()
}

export function getTownDistance(coveredArea: string, eventArea: string) {
  const starts = coveredArea.split(/[,;\n]/).map(normalizeTown).filter(Boolean)
  const destination = normalizeTown(eventArea)
  if (!destination || starts.includes(destination)) return 0
  const queue = starts.map((town) => ({ town, distance: 0 }))
  const visited = new Set(starts)
  while (queue.length) {
    const current = queue.shift()!
    for (const neighbor of TOWN_CONNECTIONS[current.town] || []) {
      if (neighbor === destination) return current.distance + 1
      if (!visited.has(neighbor)) {
        visited.add(neighbor)
        queue.push({ town: neighbor, distance: current.distance + 1 })
      }
    }
  }
  return 1
}

export function getTransportationTier(eventArea: string, townsAway: number) {
  const destination = normalizeTown(eventArea)
  if (/\b(cebu|bohol|iloilo|bacolod|davao|cagayan de oro|general santos|zamboanga|palawan)\b/.test(destination)) return "very far destination"
  if (/\b(manila|makati|pasay|paranaque|quezon|caloocan|malabon|navotas|valenzuela|marikina|pasig|mandaluyong|san juan|taguig|muntinlupa|las pinas)\b/.test(destination)) return "Metro Manila"
  if (/\b(laguna|rizal|quezon province|lucena)\b/.test(destination)) return "farther nearby province"
  if (townsAway >= 5) return "far destination"
  if (townsAway >= 3) return "extended nearby trip"
  return "nearby out-of-area trip"
}

export function getTransportationFee(eventArea: string, townsAway: number) {
  const tier = getTransportationTier(eventArea, townsAway)
  if (tier === "very far destination") return 5000
  if (tier === "Metro Manila") return 2500
  if (tier === "farther nearby province") return 2000
  if (tier === "far destination") return 2500
  if (tier === "extended nearby trip") return 1500
  return BASE_OUT_OF_AREA_FEE
}

