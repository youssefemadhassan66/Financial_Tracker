import type { Metadata, Viewport } from "next";
import { BRAND_BACKGROUND_DARK, BRAND_BACKGROUND_LIGHT } from "@/lib/brand-colors";
import { DM_Serif_Display, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { QueryProvider } from "@/providers/query-provider";
import { AuthProvider } from "@/providers/auth-provider";
import { MotionProvider } from "@/providers/motion-provider";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Big titles only (page titles, the home page), with an italic for the one
// highlighted word. UI text, labels and numbers stay in Geist.
const dmSerif = DM_Serif_Display({
  variable: "--font-dm-serif",
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Finance: your bank SMS, sorted",
    template: "%s · Finance",
  },
  description:
    "A personal finance tracker that turns the SMS your bank already sends into a clear picture of your spending, in EGP and USD.",
  // iPhone "Add to Home Screen" opens full screen, with its own name under the icon.
  appleWebApp: { capable: true, title: "Finance", statusBarStyle: "default" },
};

// Phone browser bar color, matching the page background in each theme.
export const viewport: Viewport = {
  // Lets the phone tab bar sit above the home indicator (safe-area insets).
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: BRAND_BACKGROUND_LIGHT },
    { media: "(prefers-color-scheme: dark)", color: BRAND_BACKGROUND_DARK },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${dmSerif.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <MotionProvider>
          <QueryProvider>
            <AuthProvider>
              {children}
              <Toaster position="bottom-center" />
            </AuthProvider>
          </QueryProvider>
        </MotionProvider>
      </body>
    </html>
  );
}
