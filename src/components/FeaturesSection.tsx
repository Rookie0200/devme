"use client"

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Book, Code, FileSearch, GitCommit, MessagesSquare, Search } from 'lucide-react';

const features = [
  {
    icon: Book,
    title: 'Automatic Code Documentation',
    description: 'Generate detailed documentation automatically, making it easy for both new and experienced developers to understand your codebase.',
  },
  {
    icon: Search,
    title: 'Context-Aware Search',
    description: 'Quickly find specific code components with powerful search capabilities that understand your project structure.',
  },
  {
    icon: GitCommit,
    title: 'Commit Message Summaries',
    description: 'AI-powered summaries of commit messages keep you updated on the latest changes in your repository.',
  },
  {
    icon: MessagesSquare,
    title: 'Meeting Transcription',
    description: 'Automatically transcribe meetings and extract key topics for clear, searchable records of discussions.',
  },
  {
    icon: FileSearch,
    title: 'Real-Time Meeting Search',
    description: 'Find answers from past meetings with contextual search that understands the content of your discussions.',
  },
  {
    icon: Code,
    title: 'Collaborative Platform',
    description: 'Work together seamlessly, accessing documentation, meeting summaries, and codebase data in one place.',
  },
];

const FeaturesSection: React.FC = () => {
  return (
    <section id="features" className="py-16 md:py-24 bg-secondary/30">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Powerful Features for Developers</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            CommitLytics provides the tools you need to streamline your workflow and enhance team collaboration
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <Card key={index} className="border border-border bg-card hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="h-12 w-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                  <feature.icon className="h-6 w-6 text-primary" />
                </div>
                <CardTitle>{feature.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-muted-foreground">
                  {feature.description}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeaturesSection;
