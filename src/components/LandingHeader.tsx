"use client"

import React, { useState } from 'react';
import { ModeToggle } from '@/components/toggleTheme';
import { Button } from '@/components/ui/button';
import { Menu, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';

const LandingHeader: React.FC = () => {

  const router = useRouter()
  const { data: session } = useSession()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="w-full py-4 px-4 md:px-8 flex items-center justify-between relative">
      <div className="flex items-center gap-2">
        <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
          <span className="text-primary-foreground font-bold text-xl">CL</span>
        </div>
        <h1 className="text-xl font-bold">CommitLytics</h1>
      </div>

      <div className="hidden md:flex items-center gap-6">
        <nav>
          <ul className="flex gap-6">
            <li><a href="#features" className="hover:text-primary transition-colors">Features</a></li>
            <li><a href="#benefits" className="hover:text-primary transition-colors">Benefits</a></li>
            <li><a href="#pricing" className="hover:text-primary transition-colors">Pricing</a></li>
          </ul>
        </nav>

        <div className="flex items-center gap-3">
          <div className="relative group">
            <ModeToggle />
          </div>

          <Button variant="outline" className="border-primary hover:bg-primary hover:text-primary-foreground transition-colors" onClick={() => router.push(session ? "/dashboard" : "/sign-in")}>
            {session ? "Dashboard" : "Login"}
          </Button>

          <Button className="bg-primary text-primary-foreground hover:opacity-90 transition-opacity" onClick={() =>
            router.push(session ? "/dashboard" : "/sign-up")
          }>
            {session ? "Go to Dashboard" : "Get Started"}
          </Button>
        </div>
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
      >
        {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
      </Button>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="absolute top-full left-0 right-0 bg-background border-b border-border shadow-lg py-4 px-4 z-50 md:hidden">
          <nav className="mb-4">
            <ul className="space-y-3">
              <li><a href="#features" className="block py-2 hover:text-primary transition-colors">Features</a></li>
              <li><a href="#benefits" className="block py-2 hover:text-primary transition-colors">Benefits</a></li>
              <li><a href="#pricing" className="block py-2 hover:text-primary transition-colors">Pricing</a></li>
            </ul>
          </nav>

          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <ModeToggle />
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="w-full border-primary hover:bg-primary hover:text-primary-foreground transition-colors" onClick={() => router.push(session ? "/dashboard" : "/sign-in")}>
                {session ? "Dashboard" : "Login"}
              </Button>
              <Button className="w-full bg-primary text-primary-foreground hover:opacity-90 transition-opacity" onClick={() => router.push(session ? "/dashboard" : "/sign-up")}>
                {session ? "Go to Dashboard" : "Get Started"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};

export default LandingHeader;
