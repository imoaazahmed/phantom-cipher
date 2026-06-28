import { LandingNavbar } from "@/components/layout/landing-navbar"
import { LandingFooter } from "@/components/layout/landing-footer"

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-svh flex-col bg-muted">
      <LandingNavbar />
      <div className="flex flex-1 items-center justify-center p-4">
        {children}
      </div>
      <LandingFooter />
    </div>
  )
}
