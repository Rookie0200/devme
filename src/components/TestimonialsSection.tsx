
"use client"
import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Star } from 'lucide-react';

const testimonials = [
  {
    quote: "CommitLytics has completely transformed our development workflow. The automatic documentation and meeting transcription features have saved us countless hours.",
    author: "Sarah Johnson",
    role: "CTO, TechNova",
    rating: 5
  },
  {
    quote: "The contextual search is a game-changer. Our new developers can find exactly what they need without endless scrolling through code.",
    author: "Michael Chen",
    role: "Lead Developer, CodeCraft",
    rating: 5
  },
  {
    quote: "We've reduced our meeting time by 30% since implementing CommitLytics. The AI summaries capture everything important without the fluff.",
    author: "Emily Rodriguez",
    role: "Engineering Manager, DevStream",
    rating: 4
  }
];

const TestimonialsSection: React.FC = () => {
  return (
    <section className="py-16 md:py-24 bg-secondary/30">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Trusted by Leading Teams</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            See what developers and teams are saying about CommitLytics
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {testimonials.map((testimonial, index) => (
            <Card key={index} className="border border-border bg-card hover:shadow-md transition-shadow">
              <CardContent className="p-6 flex flex-col h-full">
                <div className="flex mb-4">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={`h-5 w-5 ${i < testimonial.rating ? 'text-yellow-500 fill-yellow-500' : 'text-muted'}`}
                    />
                  ))}
                </div>
                <p className="flex-grow mb-6 text-foreground">{testimonial.quote}</p>
                <div>
                  <p className="font-semibold">{testimonial.author}</p>
                  <p className="text-sm text-muted-foreground">{testimonial.role}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-16 flex flex-wrap justify-center gap-12 items-center">
          {['TechNova', 'CodeCraft', 'DevStream', 'BuildLabs', 'StackSoft'].map((company) => (
            <div key={company} className="text-xl font-bold text-muted-foreground/70">
              {company}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default TestimonialsSection;
