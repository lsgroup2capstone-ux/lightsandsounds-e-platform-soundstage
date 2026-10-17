const BATANGAS_CITIES_AND_TOWNS = [
  "Agoncillo", "Alitagtag", "Balayan", "Balete", "Batangas City", "Bauan", "Calaca City", "Calatagan",
  "Cuenca", "Ibaan", "Laurel", "Lemery", "Lian", "Lipa City", "Lobo", "Mabini", "Malvar", "Mataasnakahoy",
  "Nasugbu", "Padre Garcia", "Rosario", "San Jose", "San Juan", "San Luis", "San Nicolas", "San Pascual",
  "Santa Teresita", "Santo Tomas City", "Taal", "Talisay", "Tanauan City", "Taysan", "Tingloy", "Tuy",
]

function normalize(value: string) {
  return value.toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim()
}

export function getCoveredCitiesAndTowns(value: string) {
  const parts = value.split(/[,;\n]/).map((part) => part.trim()).filter(Boolean)
  const recognized = recognizedCitiesAndTowns(parts)
  if (recognized.length) return recognized
  if (parts.length >= 3) return [parts[1]]
  return parts.filter((part) => !/\b(brgy|barangay|province)\b/i.test(part))
}

function recognizedCitiesAndTowns(parts: string[]) {
  return BATANGAS_CITIES_AND_TOWNS.filter((area) => parts.some((part) => normalize(part) === normalize(area)))
}
