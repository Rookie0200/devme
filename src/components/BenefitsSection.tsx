"use client"
import React from 'react';
import { Button } from '@/components/ui/button';
import { CheckCircle } from 'lucide-react';

const BenefitsSection: React.FC = () => {
  const benefits = [
    "Save up to 30% of developer time spent searching for information",
    "Reduce onboarding time for new team members by 40%",
    "Eliminate context loss between meetings and development",
    "Improve code quality through better documentation",
    "Enhance team collaboration with shared knowledge",
    "Make faster, more informed development decisions"
  ];

  return (
    <section id="benefits" className="py-16 md:py-24">
      <div className="container mx-auto px-4">
        <div className="flex flex-col lg:flex-row items-center gap-12">
          <div className="w-full lg:w-1/2">
            <div className="relative aspect-video rounded-xl overflow-hidden bg-muted">
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="relative z-10 w-16 h-16 rounded-full bg-primary/90 flex items-center justify-center cursor-pointer hover:bg-primary transition-colors">
                  <div className="w-0 h-0 border-t-8 border-t-transparent border-l-12 border-l-white border-b-8 border-b-transparent ml-1"></div>
                </div>
                <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-transparent"></div>
              </div>
            </div>
          </div>

          <div className="w-full lg:w-1/2 space-y-6">
            <div className="inline-flex items-center gap-2 text-primary font-medium">
              <div className="h-px w-8 bg-primary"></div>
              <span>Why CommitLytics?</span>
            </div>

            <h2 className="text-3xl md:text-4xl font-bold">
              Transform how your development team works together
            </h2>

            <p className="text-muted-foreground">
              CommitLytics bridges the gap between code, documentation, and communication, creating a seamless development experience that saves time and reduces frustration.
            </p>

            <div className="space-y-3 pt-2">
              {benefits.map((benefit, index) => (
                <div key={index} className="flex items-start gap-2">
                  <CheckCircle className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <p>{benefit}</p>
                </div>
              ))}
            </div>

            <Button className="mt-4 bg-primary text-primary-foreground hover:opacity-90 transition-opacity">
              See how it works
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default BenefitsSection;
