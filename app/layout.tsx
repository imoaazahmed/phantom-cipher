import { Noto_Sans_Arabic, Geist_Mono, Inter, Outfit } from "next/font/google"
import { cookies } from "next/headers"

import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { TooltipProvider } from "@/components/ui/tooltip"
import { NuqsAdapter } from "nuqs/adapters/next/app"
import { I18nProvider } from "@/components/i18n-provider"
import { DirectionProvider } from "@/components/ui/direction"
import { cn } from "@/lib/utils"
import { Toaster } from "@/components/ui/sonner"
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  getDirection,
  isValidLocale,
  type Locale,
} from "@/lib/i18n"
import enMessages from "@/messages/en.json"
import arMessages from "@/messages/ar.json"

const outfitHeading = Outfit({ subsets: ["latin"], variable: "--font-heading" })
const inter = Inter({ subsets: ["latin"], variable: "--font-sans" })
const fontMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" })
const notoSansArabic = Noto_Sans_Arabic({
  subsets: ["arabic"],
  variable: "--font-arabic",
})

const messages: Record<Locale, typeof enMessages> = {
  en: enMessages,
  ar: arMessages,
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies()
  const raw = cookieStore.get(LOCALE_COOKIE)?.value ?? DEFAULT_LOCALE
  const locale: Locale = isValidLocale(raw) ? raw : DEFAULT_LOCALE
  const dir = getDirection(locale)

  return (
    <html
      lang={locale}
      dir={dir}
      suppressHydrationWarning
      className={cn(
        "antialiased overscroll-none",
        fontMono.variable,
        "font-sans",
        inter.variable,
        outfitHeading.variable,
        notoSansArabic.variable
      )}
    >
      <body>
        <NuqsAdapter>
        <DirectionProvider dir={dir}>
          <ThemeProvider>
            <TooltipProvider>
              <I18nProvider
                key={locale}
                locale={locale}
                messages={messages[locale]}
              >
                {children}
                <Toaster position="bottom-center" />
              </I18nProvider>
            </TooltipProvider>
          </ThemeProvider>
        </DirectionProvider>
        </NuqsAdapter>
      </body>
    </html>
  )
}
