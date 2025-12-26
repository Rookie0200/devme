
"use client"
import { Button } from '@/components/ui/button';
import React from 'react';
import { ArrowRight, Code, FileSearch, MessagesSquare } from 'lucide-react';
import { useTheme } from '@/components/theme-provider';

const HeroSection: React.FC = () => {
  const { theme } = useTheme();

  // Different hero sections based on theme
  const renderHeroVariant = () => {
    return (
      <div className="flex flex-col lg:flex-row items-center gap-12">
        <div className="w-full lg:w-1/2 space-y-6">
          <div className="inline-flex items-center gap-2 bg-secondary/80 px-4 py-2 rounded-full text-sm">
            <span className="inline-block px-2 py-1 bg-primary/20 text-primary rounded-full">New</span>
            <span>AI-powered developer collaboration</span>
          </div>

          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight">
            Simplify <span className="text-gradient-primary">collaboration</span>, accelerate development
          </h1>

          <p className="text-lg text-muted-foreground">
            CommitLytics brings AI-powered documentation, code search, and meeting insights to your development workflow.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 pt-4">
            <Button size="lg" className="bg-primary text-primary-foreground hover:opacity-90 transition-opacity">
              Get started free
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button size="lg" variant="outline" className="border-primary hover:bg-primary/10">
              Book a demo
            </Button>
          </div>

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="flex -space-x-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-8 w-8 rounded-full bg-muted border-2 border-background" />
              ))}
            </div>
            <p>Join 2,000+ developers using CommitLytics</p>
          </div>
        </div>

        <div className="w-full lg:w-1/2 relative">
          <div className="relative rounded-xl overflow-hidden border border-border shadow-xl bg-card">
            <div className="h-12 w-full bg-muted/50 flex items-center px-4 gap-2">
              <div className="w-3 h-3 rounded-full bg-destructive"></div>
              <div className="w-3 h-3 rounded-full bg-muted-foreground/50"></div>
              <div className="w-3 h-3 rounded-full bg-muted-foreground/50"></div>
            </div>
            <div className="p-6">
              <div className="flex flex-col gap-6 animate-float">
                <div className="flex gap-4 items-start">
                  <Code className="h-10 w-10 text-primary p-2 bg-primary/10 rounded-lg" />
                  <div>
                    <h3 className="font-medium">Smart Code Documentation</h3>
                    <p className="text-sm text-muted-foreground">Auto-generated docs for faster onboarding</p>
                  </div>
                </div>
                <div className="flex gap-4 items-start">
                  <FileSearch className="h-10 w-10 text-primary p-2 bg-primary/10 rounded-lg" />
                  <div>
                    <h3 className="font-medium">Context-Aware Search</h3>
                    <p className="text-sm text-muted-foreground">Find code components in seconds</p>
                  </div>
                </div>
                <div className="flex gap-4 items-start">
                  <MessagesSquare className="h-10 w-10 text-primary p-2 bg-primary/10 rounded-lg" />
                  <div>
                    <h3 className="font-medium">Meeting Intelligence</h3>
                    <p className="text-sm text-muted-foreground">Never lose context from your team meetings</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="absolute -z-10 rounded-full h-64 w-64 bg-primary/20 blur-3xl bottom-0 -right-20"></div>
          <div className="absolute -z-10 rounded-full h-64 w-64 bg-primary/10 blur-3xl -top-20 -left-20"></div>
        </div>
      </div>
    );
  };

  return (
    <section className="py-16 md:py-24 w-full overflow-hidden">
      <div className="container mx-auto px-4">
        {renderHeroVariant()}
      </div>
    </section>
  );
};

export default HeroSection;
