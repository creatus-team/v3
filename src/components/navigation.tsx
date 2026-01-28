// components/navigation.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { 
  LayoutDashboard, 
  Users, 
  UserCircle, 
  MessageSquare, 
  Calculator,
  Settings,
  Zap
} from "lucide-react";

const navItems = [
  { href: "/", label: "대시보드", icon: LayoutDashboard },
  { href: "/coaches", label: "코치", icon: UserCircle },
  { href: "/students", label: "수강생", icon: Users },
  { href: "/messages", label: "인박스", icon: MessageSquare },
  { href: "/settlement", label: "정산", icon: Calculator },
  { href: "/settings", label: "설정", icon: Settings },
];

export function Navigation() {
  const pathname = usePathname();

  // 임베드 페이지와 로그인 페이지에서는 네비게이션 숨김
  if (pathname.startsWith('/embed') || pathname.startsWith('/login')) {
    return null;
  }

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* 로고 */}
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-violet-600 to-indigo-600 rounded-lg flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-xl text-slate-900">RCCC</span>
          </Link>

          {/* 네비게이션 */}
          <nav className="flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || 
                (item.href !== "/" && pathname.startsWith(item.href));

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                    isActive
                      ? "bg-violet-100 text-violet-700"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </header>
  );
}
