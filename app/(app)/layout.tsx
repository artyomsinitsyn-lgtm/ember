import SupportChat from "@/components/SupportChat";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <SupportChat />
    </>
  );
}
