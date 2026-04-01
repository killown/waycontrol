import "./globals.css";

export const metadata = {
  title: "WayControl",
  description: "Remote Control",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-br">
      <body
        style={{
          background: "#1d2021",
          color: "#ebdbb2",
          margin: 0,
          fontFamily: "sans-serif",
        }}
      >
        {children}
      </body>
    </html>
  );
}
