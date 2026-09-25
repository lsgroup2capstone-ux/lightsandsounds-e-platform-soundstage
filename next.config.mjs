/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ["192.168.18.103"],
  serverExternalPackages: ["postgres"],
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
