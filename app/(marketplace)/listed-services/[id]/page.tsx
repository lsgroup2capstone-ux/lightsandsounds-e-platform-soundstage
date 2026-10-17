import { ProviderServiceDetail } from "@/components/marketplace/provider-service-detail"

export default async function ListedServicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <ProviderServiceDetail id={id} />
}
