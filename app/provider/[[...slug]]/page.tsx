import HubWorkspace from "@/components/hubs/hub-workspace"

export default async function ProviderHub({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await params
  const path = `/provider${slug?.length ? `/${slug.join("/")}` : ""}`
  return <HubWorkspace initialPath={path} />
}
