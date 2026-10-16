import HubWorkspace from "@/components/hubs/hub-workspace"

export const metadata = {
  title: "Payroll master | SoundStage",
}

export default async function PayrollMasterHub({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await params
  const path = `/payroll-master${slug?.length ? `/${slug.join("/")}` : ""}`
  return <HubWorkspace initialPath={path} />
}
