import HubWorkspace from "@/components/hubs/hub-workspace"

export default async function AdminHub({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await params
  const path = `/admin${slug?.length ? `/${slug.join("/")}` : ""}`
  return <HubWorkspace initialPath={path} />
}
