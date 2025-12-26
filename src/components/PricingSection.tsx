
"use client"
import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Check } from 'lucide-react';

const PricingSection: React.FC = () => {
  const tiers = [
    {
      name: "Starter",
      price: "$29",
      description: "Perfect for small teams and startups",
      features: [
        "Automatic code documentation",
        "Basic commit summaries",
        "Up to 5 team members",
        "3 repositories",
        "30-day history"
      ],
      cta: "Start Free Trial",
      highlight: false
    },
    {
      name: "Pro",
      price: "$79",
      description: "For growing development teams",
      features: [
        "All Starter features",
        "Meeting transcription",
        "Advanced code search",
        "Up to 15 team members",
        "10 repositories",
        "90-day history"
      ],
      cta: "Start Free Trial",
      highlight: true
    },
    {
      name: "Enterprise",
      price: "Custom",
      description: "For organizations with advanced needs",
      features: [
        "All Pro features",
        "SSO authentication",
        "Dedicated support",
        "Unlimited team members",
        "Unlimited repositories",
        "Unlimited history"
      ],
      cta: "Contact Sales",
      highlight: false
    }
  ];

  return (
    <section id="pricing" className="py-16 md:py-24">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Simple, Transparent Pricing</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Choose the plan that works best for your team, with no hidden fees
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {tiers.map((tier, index) => (
            <Card
              key={index}
              className={`border ${tier.highlight ? 'border-primary shadow-lg relative' : 'border-border'}`}
            >
              {tier.highlight && (
                <div className="absolute -top-4 left-0 right-0 flex justify-center">
                  <div className="bg-primary text-primary-foreground text-sm font-medium py-1 px-3 rounded-full">
                    Most Popular
                  </div>
                </div>
              )}
              <CardHeader>
                <CardTitle>{tier.name}</CardTitle>
                <CardDescription>{tier.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-baseline">
                  <span className="text-4xl font-bold">{tier.price}</span>
                  {tier.price !== "Custom" && <span className="text-muted-foreground ml-1">/month</span>}
                </div>
                <ul className="space-y-2 mt-4">
                  {tier.features.map((feature, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-primary" />
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                <Button
                  className={`w-full ${tier.highlight ? 'bg-primary text-primary-foreground hover:opacity-90' : 'bg-secondary hover:bg-secondary/80'}`}
                >
                  {tier.cta}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>

        <div className="mt-12 text-center text-muted-foreground">
          <p>All plans include a 14-day free trial. No credit card required.</p>
        </div>
      </div>
    </section>
  );
};

export default PricingSection;
