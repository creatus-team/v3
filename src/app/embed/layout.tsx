// src/app/embed/layout.tsx
import './embed.css';

export default function EmbedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="embed-container">
      {children}
    </div>
  );
}
