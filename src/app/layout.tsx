import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Noto_Sans_Devanagari, Outfit, Plus_Jakarta_Sans } from "next/font/google";
import {
  ClinicProvider,
  ClinicProviderFallback,
} from "@/features/clinic/state/clinic-provider";
import { LangProvider } from "@/i18n/lang-provider";
import { Navbar } from "@/components/navbar";
import { PwaShell } from "@/components/pwa-shell";
import { ErrorBoundary } from "@/components/error-boundary";
import { ToastProvider } from "@/components/toast";
import { StaffBottomNav } from "@/components/staff-bottom-nav";
import { PatientBottomNav } from "@/components/patient-bottom-nav";
import "./globals.css";

const bodyFont = Plus_Jakarta_Sans({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const displayFont = Outfit({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const hindiFont = Noto_Sans_Devanagari({
  variable: "--font-hindi",
  subsets: ["devanagari", "latin"],
  weight: ["400", "500", "600", "700"],
});

const SITE_URL = "https://drpanwarclinic.vercel.app";
const CLINIC_PHONE = "+919636243621";

export const metadata: Metadata = {
  title: "Dr. Satta Ram Panwar | Laparoscopic & Trauma Surgeon, Jaisalmer",
  description:
    "Jaisalmer ke best Laparoscopic, Gastro aur Trauma Specialist Surgeon — Dr. Satta Ram Panwar (MBBS MS FMAS ATLS). Hernia, Appendix, Gallbladder aur Emergency surgery. Online appointment booking aur walk-in token available.",
  keywords: [
    "Surgeon Jaisalmer",
    "Laparoscopic surgeon Jaisalmer",
    "Best doctor Jaisalmer",
    "Hernia specialist Jaisalmer",
    "Appendix surgery Jaisalmer",
    "Trauma surgeon Rajasthan",
    "Dr Satta Ram Panwar",
    "Dr SR Panwar Jaisalmer",
    "Gastro surgeon Jaisalmer",
    "Gallbladder surgery Jaisalmer",
    "Emergency surgeon Jaisalmer",
    "Panwar clinic Jaisalmer",
  ],
  applicationName: "Dr SR Panwar Clinic",
  authors: [{ name: "Dr. Satta Ram Panwar", url: SITE_URL }],
  creator: "Dr. Satta Ram Panwar",
  manifest: "/manifest.webmanifest",
  metadataBase: new URL(SITE_URL),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "hi_IN",
    url: SITE_URL,
    siteName: "Dr. Satta Ram Panwar Clinic",
    title: "Dr. Satta Ram Panwar | Laparoscopic & Trauma Surgeon, Jaisalmer",
    description:
      "Jaisalmer ke best Laparoscopic, Gastro aur Trauma Specialist Surgeon. MBBS MS FMAS ATLS. Hernia, Appendix, Gallbladder surgery. Online appointment available.",
    images: [
      {
        url: "/dr-panwar-circle.png",
        width: 512,
        height: 512,
        alt: "Dr. Satta Ram Panwar — Laparoscopic & Trauma Surgeon, Jaisalmer",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "Dr. Satta Ram Panwar | Surgeon, Jaisalmer",
    description:
      "Laparoscopic, Gastro & Trauma Specialist Surgeon in Jaisalmer. Online appointment booking available.",
    images: ["/dr-panwar-circle.png"],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Dr SR Panwar",
    startupImage: "/logo.png",
  },
  icons: {
    icon: [{ url: "/logo.png", type: "image/png" }],
    apple: [{ url: "/logo.png", sizes: "512x512", type: "image/png" }],
  },
  formatDetection: {
    telephone: false,
  },
  other: {
    "mobile-web-app-capable": "yes",
    "google-site-verification": "I8WRhWkAShFVWjZHnTPc15AxpBkTijOFynaSoa0XDak",
  },
};

export const viewport: Viewport = {
  themeColor: "#0f6b63",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

// JSON-LD Structured Data — Medical Business + Physician Schema
const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": ["MedicalBusiness", "Physician"],
      "@id": `${SITE_URL}/#physician`,
      name: "Dr. Satta Ram Panwar — Surgical & Trauma Clinic",
      alternateName: ["Dr SR Panwar Clinic", "Panwar Health Care", "Panwar Surgical Clinic"],
      description:
        "Advance Laparoscopic, Gastro & Trauma Specialist Surgeon in Jaisalmer, Rajasthan. Expert in Hernia repair, Appendix surgery, Gallbladder removal, and Emergency Trauma surgery. MBBS MS FMAS ATLS.",
      url: SITE_URL,
      telephone: CLINIC_PHONE,
      email: "drsrpanwar08@gmail.com",
      image: `${SITE_URL}/dr-panwar-circle.png`,
      logo: `${SITE_URL}/logo.png`,
      priceRange: "₹₹",
      currenciesAccepted: "INR",
      paymentAccepted: "Cash, UPI",
      address: {
        "@type": "PostalAddress",
        streetAddress: "Qtr No. 1, Behind Poonam Stadium",
        addressLocality: "Jaisalmer",
        addressRegion: "Rajasthan",
        postalCode: "345001",
        addressCountry: "IN",
      },
      geo: {
        "@type": "GeoCoordinates",
        latitude: 26.912695,
        longitude: 70.905230,
      },
      hasMap: "https://www.google.com/maps/search/?api=1&query=26.912695,70.905230",
      openingHoursSpecification: [
        {
          "@type": "OpeningHoursSpecification",
          dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
          opens: "09:00",
          closes: "18:00",
        },
      ],
      medicalSpecialty: ["Surgery", "Laparoscopic Surgery", "Trauma Surgery", "Gastroenterology"],
      availableService: [
        { "@type": "MedicalProcedure", name: "Laparoscopic Surgery" },
        { "@type": "MedicalProcedure", name: "Hernia Repair (Laparoscopic)" },
        { "@type": "MedicalProcedure", name: "Appendix Surgery (Appendectomy)" },
        { "@type": "MedicalProcedure", name: "Gallbladder Removal (Cholecystectomy)" },
        { "@type": "MedicalProcedure", name: "Trauma & Emergency Surgery" },
        { "@type": "MedicalProcedure", name: "Gastro Surgery" },
      ],
      sameAs: ["https://www.google.com/maps/search/?api=1&query=26.912695,70.905230"],
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: "Dr. Satta Ram Panwar Clinic",
      description:
        "Online appointment booking, walk-in token & live queue for Dr. SR Panwar Clinic, Jaisalmer",
      inLanguage: ["hi", "en"],
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="hi"
      className={`${bodyFont.variable} ${displayFont.variable} ${hindiFont.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* JSON-LD Structured Data for Google & AI Search */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <LangProvider>
          <ToastProvider>
            <ErrorBoundary>
              <Suspense
                fallback={
                  <ClinicProviderFallback>
                    <Navbar />
                    <PwaShell />
                    <main className="flex-1 pb-24">{children}</main>
                  </ClinicProviderFallback>
                }
              >
                <ClinicProvider>
                  <Navbar />
                  <PwaShell />
                  <main className="flex-1 pb-24">{children}</main>
                  <StaffBottomNav />
                  <PatientBottomNav />
                </ClinicProvider>
              </Suspense>
            </ErrorBoundary>
          </ToastProvider>
        </LangProvider>
      </body>
    </html>
  );
}
