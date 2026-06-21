import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Patient View - QueueCure",
  description: "Track your position in the clinic queue in real-time.",
  manifest: "/manifest.json",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#4f46e5",
};

export default function PatientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
