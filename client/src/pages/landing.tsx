import { motion } from "framer-motion";
import { ArrowRight, Layout, ShoppingBag, Terminal, Zap, Layers, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import heroBg from "@assets/generated_images/abstract_dark_neon_glassmorphism_background.png";

const fadeInUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } }
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.2
    }
  }
};

export default function Landing() {
  return (
    <div className="min-h-screen w-full overflow-x-hidden text-foreground selection:bg-primary selection:text-primary-foreground">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 backdrop-blur-md border-b border-white/5 bg-background/50">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
            <Zap className="h-5 w-5 text-white" />
          </div>
          <span className="font-display font-bold text-xl tracking-tight">Replit<span className="text-primary">Concept</span></span>
        </div>
        <Button variant="ghost" size="sm" className="font-medium hover:text-primary hover:bg-white/5">
          Sign In
        </Button>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 px-6 md:pt-48 md:pb-32">
        <div className="absolute inset-0 z-0">
          <img 
            src={heroBg} 
            alt="Abstract Background" 
            className="w-full h-full object-cover opacity-40 mask-image-gradient"
            style={{ maskImage: 'linear-gradient(to bottom, black 40%, transparent 100%)' }}
          />
          <div className="absolute inset-0 bg-background/60 backdrop-blur-[1px]" />
        </div>

        <div className="container mx-auto relative z-10 max-w-5xl">
          <motion.div 
            initial="hidden"
            animate="visible"
            variants={staggerContainer}
            className="flex flex-col items-center text-center"
          >
            <motion.div variants={fadeInUp} className="mb-6 inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-sm font-medium text-primary backdrop-blur-sm">
              <span className="mr-2 h-2 w-2 rounded-full bg-primary animate-pulse" />
              Mockup Mode Active
            </motion.div>
            
            <motion.h1 variants={fadeInUp} className="font-display text-5xl md:text-7xl font-extrabold tracking-tight leading-[1.1] mb-6">
              What do you want <br />
              <span className="text-gradient-cyan">to build today?</span>
            </motion.h1>
            
            <motion.p variants={fadeInUp} className="text-lg md:text-xl text-muted-foreground max-w-2xl mb-10 leading-relaxed">
              I am your Design Engineer. I don't just write code; I craft interfaces. 
              From modern SaaS dashboards to boutique e-commerce and cyberpunk terminals.
            </motion.p>
            
            <motion.div variants={fadeInUp} className="flex flex-wrap gap-4 justify-center">
              <Button size="lg" className="rounded-full h-12 px-8 text-base bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_20px_rgba(0,255,255,0.3)] transition-all hover:scale-105">
                Start a Project
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button size="lg" variant="outline" className="rounded-full h-12 px-8 text-base border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 backdrop-blur-sm">
                Explore Styles
              </Button>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Showcase Grid */}
      <section className="py-20 px-6 relative z-10">
        <div className="container mx-auto max-w-6xl">
          <div className="mb-12 text-center">
            <h2 className="font-display text-3xl font-bold mb-4">Choose Your Aesthetic</h2>
            <p className="text-muted-foreground">I can adapt to any design language you need.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Card 1: SaaS */}
            <motion.div 
              whileHover={{ y: -10 }}
              className="group"
            >
              <div className="glass-panel rounded-2xl p-1 h-full overflow-hidden transition-all duration-300 group-hover:border-primary/50 group-hover:shadow-[0_8px_40px_rgba(0,255,255,0.15)]">
                <div className="bg-card/50 h-full rounded-xl p-6 flex flex-col">
                  <div className="h-12 w-12 rounded-lg bg-blue-500/10 flex items-center justify-center mb-4 text-blue-400">
                    <Layout className="h-6 w-6" />
                  </div>
                  <h3 className="font-display text-xl font-bold mb-2">Modern SaaS</h3>
                  <p className="text-muted-foreground text-sm mb-6 flex-grow">
                    Clean, data-dense interfaces with glossy cards, charts, and highly functional layouts. Perfect for dashboards and tools.
                  </p>
                  <div className="h-32 w-full rounded-lg bg-gradient-to-br from-slate-900 to-slate-800 border border-white/5 relative overflow-hidden group-hover:scale-[1.02] transition-transform duration-500">
                    {/* Mock UI */}
                    <div className="absolute top-3 left-3 right-3 h-2 bg-white/10 rounded-full w-1/3" />
                    <div className="absolute top-8 left-3 right-3 bottom-3 grid grid-cols-3 gap-2">
                      <div className="bg-blue-500/20 rounded" />
                      <div className="bg-white/5 rounded col-span-2" />
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Card 2: Boutique */}
            <motion.div 
              whileHover={{ y: -10 }}
              className="group"
            >
              <div className="glass-panel rounded-2xl p-1 h-full overflow-hidden transition-all duration-300 group-hover:border-purple-400/50 group-hover:shadow-[0_8px_40px_rgba(192,132,252,0.15)]">
                <div className="bg-card/50 h-full rounded-xl p-6 flex flex-col">
                  <div className="h-12 w-12 rounded-lg bg-purple-500/10 flex items-center justify-center mb-4 text-purple-400">
                    <ShoppingBag className="h-6 w-6" />
                  </div>
                  <h3 className="font-display text-xl font-bold mb-2">Boutique & Luxury</h3>
                  <p className="text-muted-foreground text-sm mb-6 flex-grow">
                    Elegant serif typography, generous whitespace, and immersive imagery. Ideal for fashion, portfolios, and high-end brands.
                  </p>
                  <div className="h-32 w-full rounded-lg bg-[#1a1a1a] border border-white/5 relative overflow-hidden group-hover:scale-[1.02] transition-transform duration-500 flex items-center justify-center">
                    <span className="font-serif italic text-2xl text-white/20">Elegant</span>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Card 3: Cyberpunk */}
            <motion.div 
              whileHover={{ y: -10 }}
              className="group"
            >
              <div className="glass-panel rounded-2xl p-1 h-full overflow-hidden transition-all duration-300 group-hover:border-green-400/50 group-hover:shadow-[0_8px_40px_rgba(74,222,128,0.15)]">
                <div className="bg-card/50 h-full rounded-xl p-6 flex flex-col">
                  <div className="h-12 w-12 rounded-lg bg-green-500/10 flex items-center justify-center mb-4 text-green-400">
                    <Terminal className="h-6 w-6" />
                  </div>
                  <h3 className="font-display text-xl font-bold mb-2">Dev Terminal</h3>
                  <p className="text-muted-foreground text-sm mb-6 flex-grow">
                    Monospaced fonts, high contrast, and raw technical aesthetics. Great for developer tools, CLIs, and futuristic concepts.
                  </p>
                  <div className="h-32 w-full rounded-lg bg-black border border-green-500/20 relative overflow-hidden group-hover:scale-[1.02] transition-transform duration-500 p-3 font-mono text-[10px] text-green-500/60">
                    &gt; init_system<br/>
                    &gt; loading modules...<br/>
                    &gt; <span className="animate-pulse">_</span>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Capabilities Strip */}
      <section className="py-20 border-t border-white/5 bg-white/[0.02]">
        <div className="container mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <div className="flex flex-col items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <Layers className="h-5 w-5" />
              </div>
              <h4 className="font-medium">Component Systems</h4>
            </div>
            <div className="flex flex-col items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-purple-500/10 flex items-center justify-center text-purple-400">
                <Palette className="h-5 w-5" />
              </div>
              <h4 className="font-medium">Custom Theming</h4>
            </div>
            <div className="flex flex-col items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-pink-500/10 flex items-center justify-center text-pink-400">
                <Zap className="h-5 w-5" />
              </div>
              <h4 className="font-medium">Interactive Motion</h4>
            </div>
            <div className="flex flex-col items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-orange-500/10 flex items-center justify-center text-orange-400">
                <Layout className="h-5 w-5" />
              </div>
              <h4 className="font-medium">Responsive Layouts</h4>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
