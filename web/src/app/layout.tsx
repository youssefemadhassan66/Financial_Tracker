import type { Metadata, Viewport } from "next";
import { BRAND_BACKGROUND_DARK, BRAND_BACKGROUND_LIGHT } from "@/lib/brand-colors";
import { Geist, Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
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

// Masroof's voice: every heading, ExtraBold for big titles. Body text,
// labels and numbers stay in Geist (tabular figures for money).
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  weight: ["600", "700", "800"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Masroof: your bank SMS, sorted",
    template: "%s · Masroof",
  },
  description:
    "A personal finance tracker that turns the SMS your bank already sends into a clear picture of your spending, in EGP and USD.",
  // iPhone "Add to Home Screen" opens full screen, with its own name under the icon.
  appleWebApp: { capable: true, title: "Masroof", statusBarStyle: "default" },
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
      className={`${geistSans.variable} ${geistMono.variable} ${jakarta.variable} h-full antialiased`}
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
