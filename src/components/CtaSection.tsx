"use client"

import React from 'react';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';

const CtaSection: React.FC = () => {

  return (
    <section className="py-16 md:py-24">
      <div className="container mx-auto px-4">
        <div className="bg-card border border-border rounded-2xl p-8 md:p-12 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent pointer-events-none"></div>
          <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="text-center md:text-left space-y-4 max-w-xl">
              <h2 className="text-3xl md:text-4xl font-bold">Ready to transform your development process?</h2>
              <p className="text-lg text-muted-foreground">
                Join thousands of developers and teams already using CommitLytics to improve collaboration and productivity.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-4">
              <Button size="lg" className="bg-primary text-primary-foreground hover:opacity-90 transition-opacity">
                Get started free
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button size="lg" variant="outline" className="border-primary hover:bg-primary/10">
                Book a demo
              </Button>
            </div>
          </div>
          <div className="absolute -z-10 rounded-full h-64 w-64 bg-primary/10 blur-3xl bottom-0 -right-20"></div>
          <div className="absolute -z-10 rounded-full h-64 w-64 bg-primary/5 blur-3xl -top-20 -left-20"></div>
        </div>
      </div>
    </section>
  );
};

export default CtaSection;
