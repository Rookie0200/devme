"use client"

import React from 'react';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
import { useTheme } from '@/components/theme-provider';

const CtaSection: React.FC = () => {
  const { theme } = useTheme();

  // Different CTA sections based on theme
  const renderCtaVariant = () => {
    // Sales theme (PipAI-inspired)
    if (theme === 'theme-sales') {
      return (
        <div className="py-16 px-4 md:px-8 flex flex-col items-center text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Revolutionize Your <span className="text-primary">Sales</span> Process with Our Tool.
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mb-8">
            Our AI-powered platform helps you streamline operations and close more deals.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
            <Button size="lg" className="bg-primary text-primary-foreground hover:opacity-90">
              Start free trial
            </Button>
            <Button size="lg" variant="outline">
              Schedule a demo
            </Button>
          </div>

          <div className="grid grid-cols-3 gap-4 md:gap-12 mt-12 max-w-3xl w-full">
            <div className="text-center">
              <div className="text-3xl font-bold">4.9</div>
              <div className="text-sm text-muted-foreground">Trustpilot</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold">5.0</div>
              <div className="text-sm text-muted-foreground">Product Hunt</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold">4.9</div>
              <div className="text-sm text-muted-foreground">G2 Crowd</div>
            </div>
          </div>
        </div>
      );
    }

    // Finance theme (WealthAI-inspired)
    if (theme === 'theme-finance') {
      return (
        <div className="bg-orange-50 rounded-2xl p-8 md:p-12">
          <div className="flex flex-col md:flex-row justify-between items-center gap-8">
            <div className="md:w-1/2">
              <h2 className="text-2xl md:text-3xl font-bold mb-4">
                Why choose AI for your finances?
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
                <div className="bg-white p-6 rounded-lg shadow-sm">
                  <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center mb-4">
                    <span className="text-amber-600 font-semibold">1</span>
                  </div>
                  <h3 className="font-semibold mb-2">Save Time</h3>
                  <p className="text-sm text-muted-foreground">
                    No more spreadsheets or complicated bookkeeping systems.
                  </p>
                </div>
                <div className="bg-white p-6 rounded-lg shadow-sm">
                  <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center mb-4">
                    <span className="text-amber-600 font-semibold">2</span>
                  </div>
                  <h3 className="font-semibold mb-2">Reduce Stress</h3>
                  <p className="text-sm text-muted-foreground">
                    Get insights delivered right to you without the hassle.
                  </p>
                </div>
                <div className="bg-white p-6 rounded-lg shadow-sm">
                  <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center mb-4">
                    <span className="text-amber-600 font-semibold">3</span>
                  </div>
                  <h3 className="font-semibold mb-2">Increase Savings</h3>
                  <p className="text-sm text-muted-foreground">
                    Find opportunities to optimize spending and grow your wealth.
                  </p>
                </div>
              </div>
            </div>
            <div className="md:w-1/2 bg-white p-8 rounded-xl shadow-lg">
              <div className="flex items-start gap-4">
                <div className="mt-1">
                  <svg className="h-10 w-10 text-orange-500" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm-.997-6l7.07-7.071-1.414-1.414-5.656 5.657-2.829-2.829-1.414 1.414L11.003 16z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-2">Ready to take control of your financial future?</h3>
                  <p className="mb-4 text-muted-foreground">
                    Join thousands of happy users who have transformed their relationship with money.
                  </p>
                  <Button className="bg-orange-500 hover:bg-orange-600 text-white">
                    Get started free
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // Corporate theme (Clause-inspired)
    if (theme === 'theme-corporate') {
      return (
        <div className="bg-[#1C2A34] text-white rounded-none p-10 md:p-16 relative overflow-hidden">
          <div className="absolute -top-24 -right-24 w-64 h-64 bg-primary/20 rounded-full blur-3xl"></div>
          <div className="absolute -bottom-32 -left-32 w-72 h-72 bg-primary/10 rounded-full blur-3xl"></div>

          <div className="relative z-10 max-w-3xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">Discover the full scale of CommitLytics capabilities</h2>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button variant="outline" className="bg-transparent border-white hover:bg-white/10">
                Get started
              </Button>
              <Button className="bg-primary hover:bg-primary/90">
                Start free trial
              </Button>
            </div>
          </div>
        </div>
      );
    }

    // Deep Tech theme
    if (theme === 'theme-deep-tech') {
      return (
        <div className="bg-gradient-to-br from-indigo-900 to-indigo-950 rounded-xl p-8 md:p-12 relative overflow-hidden">
          <div className="absolute inset-0 bg-grid-white/5 [mask-image:linear-gradient(to_bottom,transparent,black)]"></div>
          <div className="absolute -top-24 -right-24 w-64 h-64 bg-purple-500/20 rounded-full blur-3xl"></div>

          <div className="grid md:grid-cols-2 gap-8 items-center relative z-10">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Supercharge your development workflow</h2>
              <p className="text-indigo-200 mb-6">
                Join thousands of teams who are already using CommitLytics to improve collaboration and productivity.
              </p>
              <div className="flex flex-wrap gap-4">
                <Button size="lg" className="bg-white text-indigo-900 hover:bg-indigo-100">
                  Get started
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <Button size="lg" variant="outline" className="border-white text-white hover:bg-white/10">
                  Book a demo
                </Button>
              </div>
            </div>
            <div className="hidden md:block bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg p-6 relative">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 to-blue-500"></div>
              <h3 className="text-white font-medium mb-2">What our customers say:</h3>
              <p className="text-indigo-100 italic">
                "CommitLytics has transformed how our team communicates. The AI-powered documentation has saved us countless hours of work."
              </p>
              <div className="mt-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-indigo-700"></div>
                <div>
                  <p className="text-white font-medium">Alex Johnson</p>
                  <p className="text-indigo-300 text-sm">CTO, TechLabs</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // Dev theme
    if (theme === 'theme-dev') {
      return (
        <div className="border border-border rounded-xl bg-card p-8 md:p-12 relative">
          <div className="grid md:grid-cols-2 gap-6 items-center">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 bg-primary/10 px-3 py-1 rounded-full text-sm text-primary">
                <span className="h-1.5 w-1.5 bg-primary rounded-full"></span>
                <span>New features available</span>
              </div>
              <h2 className="text-2xl md:text-3xl font-bold">Ready to streamline your code documentation?</h2>
              <p className="text-muted-foreground text-sm md:text-base">
                Get started with CommitLytics today and see the difference in your team's productivity.
              </p>
              <div className="pt-2 space-y-2">
                <Button size="lg" className="w-full sm:w-auto bg-primary text-primary-foreground">
                  Start coding now
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <p className="text-sm text-muted-foreground">No credit card required.</p>
              </div>
            </div>
            <div className="bg-background/50 p-4 rounded-lg border border-border">
              <div className="text-sm text-muted-foreground overflow-hidden font-mono">
                <p className="text-primary-foreground/70">// CommitLytics automatically documents your code</p>
                <p><span className="text-green-500">function</span> <span className="text-yellow-500">analyzeCode</span>() {'{'}</p>
                <p>&nbsp;&nbsp;<span className="text-purple-500">const</span> insights = <span className="text-blue-500">AI</span>.process(repository);</p>
                <p>&nbsp;&nbsp;<span className="text-purple-500">return</span> insights.documentation;</p>
                <p>{'}'}</p>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // Default - Minimal theme
    return (
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
    );
  };

  return (
    <section className="py-16 md:py-24">
      <div className="container mx-auto px-4">
        {renderCtaVariant()}
      </div>
    </section>
  );
};

export default CtaSection;
