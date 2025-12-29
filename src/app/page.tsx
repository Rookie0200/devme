import BenefitsSection from "@/components/BenefitsSection";
import CtaSection from "@/components/CtaSection";
import FeaturesSection from "@/components/FeaturesSection";
import HeroSection from "@/components/HeroSection";
import LandingFooter from "@/components/LandingFooter";
import LandingHeader from "@/components/LandingHeader";
import PricingSection from "@/components/PricingSection";
import TestimonialsSection from "@/components/TestimonialsSection";

export default async function Home() {


  return (
    <div className="min-h-screen flex flex-col">
      <LandingHeader />
      <main>
        <HeroSection />
        <FeaturesSection />
        <BenefitsSection />
        <TestimonialsSection />
        <PricingSection />
        <CtaSection />
      </main>
      <LandingFooter />
    </div>
  );
}
