import './globals.css';

export const metadata = {
  title: 'Placement Training Planner',
  description:
    'Track placement preparation progress with authentication and personal status sync.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
