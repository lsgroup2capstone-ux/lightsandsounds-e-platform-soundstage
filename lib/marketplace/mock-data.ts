export type ServiceCategory = "Sound System" | "Lighting" | "Full Production" | "Band & Stage"

// The ten table statuses (booking D4); the capitalized values remain for old data.
export type BookingStatus = "pending" | "accepted" | "awaiting_payment" | "confirmed" | "in_progress" | "completed" | "declined" | "cancelled" | "refund_pending" | "refunded"
  | "Pending" | "Confirmed" | "Cancelled" | "Completed"

export type Location = "Balayan" | "Nasugbu" | "Lian"

export interface Provider {
  id: string
  name: string
  location: Location
  rating: number
  reviews: number
  verified: boolean
  since: number
  bio: string
}

export interface ServicePackage {
  id: string
  name: string
  provider: Provider
  category: ServiceCategory
  location: Location
  price: number
  image: string
  rating: number
  reviews: number
  premium: boolean
  tagline: string
  inclusions: string[]
  capacity: string
  coverageAreas?: string
  transportationFee?: number
}

export interface Booking {
  id: string
  packageId: string
  packageName: string
  provider: string
  client: string
  image: string
  date: string
  time: string
  eventType?: string
  location: string
  guests: number
  notes: string
  durationDays?: number
  basePrice?: number
  transportationFee?: number
  eventTown?: string
  townsAway?: number
  coverageAreas?: string
  total: number
  downpayment: number
  status: BookingStatus
  paid: boolean
  paidAt?: string
  completedAt?: string
  cancelledBy?: "client" | "provider" | "admin"
  cancelledAt?: string
  // Server-computed: the client may request a refund now (same rule as the refund transition).
  refundEligible?: boolean
  refund?: { status: "Pending" | "Paid" | "Rejected"; amount: number; method: string; account: string; requestedAt: string; processedAt?: string; reference?: string; reason?: string }
  feedback?: { rating: number; comment: string; createdAt: string }
  paymentMethod?: string
}

export const providers: Provider[] = [
  {
    id: "p1",
    name: "Balayan Beats Productions",
    location: "Balayan",
    rating: 4.9,
    reviews: 128,
    verified: true,
    since: 2016,
    bio: "Family-run lights and sounds outfit serving fiestas, weddings, and corporate events across western Batangas for over 8 years.",
  },
  {
    id: "p2",
    name: "Nasugbu Wave Audio",
    location: "Nasugbu",
    rating: 4.7,
    reviews: 86,
    verified: true,
    since: 2019,
    bio: "Beach-event specialists with weatherproof rigs and clean line-array systems for open venues.",
  },
  {
    id: "p3",
    name: "Lian Luxe Events",
    location: "Lian",
    rating: 4.8,
    reviews: 64,
    verified: true,
    since: 2020,
    bio: "Premium production house delivering LED walls, intelligent lighting, and full-stage setups.",
  },
  {
    id: "p4",
    name: "Coastline Sound Co.",
    location: "Nasugbu",
    rating: 4.6,
    reviews: 41,
    verified: true,
    since: 2021,
    bio: "Reliable mid-tier packages perfect for birthdays, reunions, and barangay events.",
  },
]

export const demoPackages: ServicePackage[] = [
  {
    id: "s1",
    name: "Fiesta Grand Sound & Lights",
    provider: providers[0],
    category: "Full Production",
    location: "Balayan",
    price: 38000,
    image: "/images/pkg-band.webp",
    rating: 4.9,
    reviews: 74,
    premium: true,
    tagline: "Complete stage production for large celebrations.",
    capacity: "Up to 800 guests",
    inclusions: [
      "Line-array sound system (10,000W)",
      "12x intelligent moving-head lights",
      "3m x 4m LED backdrop wall",
      "2 wireless mics + operator",
      "On-site technician for the full event",
    ],
  },
  {
    id: "s2",
    name: "Beach Party Audio Rig",
    provider: providers[1],
    category: "Sound System",
    location: "Nasugbu",
    price: 18500,
    image: "/images/pkg-sound.webp",
    rating: 4.7,
    reviews: 52,
    premium: false,
    tagline: "Weatherproof sound tuned for open-air venues.",
    capacity: "Up to 300 guests",
    inclusions: [
      "6,000W PA speaker system",
      "12-channel digital mixer",
      "2 wireless microphones",
      "DJ table + monitor speaker",
      "Setup and teardown included",
    ],
  },
  {
    id: "s3",
    name: "Luxe LED Lighting Suite",
    provider: providers[2],
    category: "Lighting",
    location: "Lian",
    price: 24000,
    image: "/images/pkg-lights.webp",
    rating: 4.8,
    reviews: 39,
    premium: true,
    tagline: "Cinematic lighting design for elegant events.",
    capacity: "Up to 400 guests",
    inclusions: [
      "16x moving-head beam lights",
      "Uplighting package (20 fixtures)",
      "Haze machine + effects",
      "Lighting console + programmer",
      "Custom color scenes for your theme",
    ],
  },
  {
    id: "s4",
    name: "Barangay Event Starter",
    provider: providers[3],
    category: "Sound System",
    location: "Nasugbu",
    price: 9500,
    image: "/images/pkg-sound.webp",
    rating: 4.6,
    reviews: 28,
    premium: false,
    tagline: "Affordable, dependable sound for smaller gatherings.",
    capacity: "Up to 150 guests",
    inclusions: [
      "3,000W speaker system",
      "8-channel mixer",
      "2 wired microphones",
      "Basic par-can lighting",
      "Half-day rental",
    ],
  },
  {
    id: "s5",
    name: "Wedding Elegance Package",
    provider: providers[0],
    category: "Full Production",
    location: "Balayan",
    price: 32000,
    image: "/images/pkg-band.webp",
    rating: 4.9,
    reviews: 61,
    premium: true,
    tagline: "Warm, romantic sound and lighting for your big day.",
    capacity: "Up to 500 guests",
    inclusions: [
      "8,000W sound system",
      "Warm-tone uplighting + spotlights",
      "Wireless mics for ceremony & reception",
      "Fairy-light backdrop",
      "Dedicated event coordinator",
    ],
  },
  {
    id: "s6",
    name: "Concert Band & Stage Kit",
    provider: providers[2],
    category: "Band & Stage",
    location: "Lian",
    price: 45000,
    image: "/images/pkg-band.webp",
    rating: 4.8,
    reviews: 33,
    premium: true,
    tagline: "Full band backline and stage for live performances.",
    capacity: "Up to 1,000 guests",
    inclusions: [
      "Full backline (drums, amps, keys)",
      "16-channel stage monitoring",
      "Truss stage lighting rig",
      "2 sound engineers",
      "6m x 4m elevated stage",
    ],
  },
]

// Browse starts empty; provider-created packages can be added here later.
export const packages: ServicePackage[] = []

export const bookings: Booking[] = []

export const categories: ServiceCategory[] = ["Sound System", "Lighting", "Full Production", "Band & Stage"]
export const locations: Location[] = ["Balayan", "Nasugbu", "Lian"]

export function formatPeso(value: number): string {
  return "\u20B1" + value.toLocaleString("en-PH")
}

export function getPackage(id: string): ServicePackage | undefined {
  return packages.find((p) => p.id === id)
}

export const statusStyles: Record<BookingStatus, { label: string; className: string }> = {
  Confirmed: { label: "Confirmed", className: "bg-success/15 text-success border-success/30" },
  Pending: { label: "Pending", className: "bg-warning/15 text-warning border-warning/30" },
  Cancelled: { label: "Cancelled", className: "bg-destructive/15 text-destructive border-destructive/30" },
  Completed: { label: "Completed", className: "bg-primary/15 text-primary border-primary/30" },
  pending: { label: "Requested", className: "bg-warning/15 text-warning border-warning/30" },
  accepted: { label: "Accepted", className: "bg-warning/15 text-warning border-warning/30" },
  awaiting_payment: { label: "Awaiting payment", className: "bg-warning/15 text-warning border-warning/30" },
  confirmed: { label: "Confirmed", className: "bg-success/15 text-success border-success/30" },
  in_progress: { label: "In progress", className: "bg-primary/15 text-primary border-primary/30" },
  completed: { label: "Completed", className: "bg-primary/15 text-primary border-primary/30" },
  declined: { label: "Declined", className: "bg-destructive/15 text-destructive border-destructive/30" },
  cancelled: { label: "Cancelled", className: "bg-destructive/15 text-destructive border-destructive/30" },
  refund_pending: { label: "Refund pending", className: "bg-warning/15 text-warning border-warning/30" },
  refunded: { label: "Refunded", className: "bg-muted text-muted-foreground border-border" },
}
