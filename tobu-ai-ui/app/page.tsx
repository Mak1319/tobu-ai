import CTASection1 from "@/components/blocks/cta-ex-1";
import FeaturesSection from "@/components/blocks/feature-ex-1";
import Hero2 from "@/components/blocks/hero-ex-2";
import DivBlockFooter from "@/components/Footer-ex-2";

export default function Home() {
    return (
        <main className="min-h-screen bg-background text-foreground">
            <Hero2 />
            <FeaturesSection />
            <CTASection1 />
            <DivBlockFooter />
        </main>
    );
}
