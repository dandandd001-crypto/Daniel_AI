import { motion } from "framer-motion";
import { ArrowRight, Zap, Code, Terminal, Brain, Rocket, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

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
  const [, setLocation] = useLocation();
  
  return (
    <div className="min-h-screen w-full overflow-x-hidden text-foreground selection:bg-primary selection:text-primary-foreground">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 backdrop-blur-md border-b border-white/5 bg-background/50">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center">
            <Zap className="h-5 w-5 text-white" />
          </div>
          <span className="font-display font-bold text-xl tracking-tight">DANIEL<span className="text-primary"> AI DEV</span></span>
        </div>
        <Button 
          variant="ghost" 
          size="sm" 
          className="font-medium hover:text-primary hover:bg-white/5"
          onClick={() => setLocation("/dashboard")}
          data-testid="button-sign-in"
        >
          Open Dashboard
        </Button>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 px-6 md:pt-48 md:pb-32">
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-purple-500/5 to-transparent" />
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
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
              Unlimited AI Power
            </motion.div>
            
            <motion.h1 variants={fadeInUp} className="font-display text-5xl md:text-7xl font-extrabold tracking-tight leading-[1.1] mb-6">
              Your Personal <br />
              <span className="text-gradient-cyan">AI Coding Assistant</span>
            </motion.h1>
            
            <motion.p variants={fadeInUp} className="text-lg md:text-xl text-muted-foreground max-w-2xl mb-10 leading-relaxed">
              Build anything with AI that can read, write, and execute code. 
              No limits. Full system access. Deploy anywhere.
            </motion.p>
            
            <motion.div variants={fadeInUp} className="flex flex-wrap gap-4 justify-center">
              <Button 
                size="lg" 
                className="rounded-full h-12 px-8 text-base bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_20px_rgba(0,255,255,0.3)] transition-all hover:scale-105"
                onClick={() => setLocation("/dashboard")}
                data-testid="button-start-project"
              >
                Start Building
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button 
                size="lg" 
                variant="outline" 
                className="rounded-full h-12 px-8 text-base border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 backdrop-blur-sm"
                onClick={() => setLocation("/dashboard")}
              >
                Go to Dashboard
              </Button>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-6 relative z-10">
        <div className="container mx-auto max-w-6xl">
          <div className="mb-12 text-center">
            <h2 className="font-display text-3xl font-bold mb-4">Powerful Capabilities</h2>
            <p className="text-muted-foreground">Everything you need to build and deploy applications</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <motion.div 
              whileHover={{ y: -10 }}
              className="group"
            >
              <div className="glass-panel rounded-2xl p-1 h-full overflow-hidden transition-all duration-300 group-hover:border-primary/50 group-hover:shadow-[0_8px_40px_rgba(0,255,255,0.15)]">
                <div className="bg-card/50 h-full rounded-xl p-6 flex flex-col">
                  <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4 text-primary">
                    <Code className="h-6 w-6" />
                  </div>
                  <h3 className="font-display text-xl font-bold mb-2">Full Code Access</h3>
                  <p className="text-muted-foreground text-sm mb-6 flex-grow">
                    Read, write, edit, and delete files. The AI has complete access to your project directory.
                  </p>
                </div>
              </div>
            </motion.div>

            {/* Feature 2 */}
            <motion.div 
              whileHover={{ y: -10 }}
              className="group"
            >
              <div className="glass-panel rounded-2xl p-1 h-full overflow-hidden transition-all duration-300 group-hover:border-purple-400/50 group-hover:shadow-[0_8px_40px_rgba(192,132,252,0.15)]">
                <div className="bg-card/50 h-full rounded-xl p-6 flex flex-col">
                  <div className="h-12 w-12 rounded-lg bg-purple-500/10 flex items-center justify-center mb-4 text-purple-400">
                    <Terminal className="h-6 w-6" />
                  </div>
                  <h3 className="font-display text-xl font-bold mb-2">Shell Execution</h3>
                  <p className="text-muted-foreground text-sm mb-6 flex-grow">
                    Run any command, install packages, start servers, and deploy applications directly.
                  </p>
                </div>
              </div>
            </motion.div>

            {/* Feature 3 */}
            <motion.div 
              whileHover={{ y: -10 }}
              className="group"
            >
              <div className="glass-panel rounded-2xl p-1 h-full overflow-hidden transition-all duration-300 group-hover:border-green-400/50 group-hover:shadow-[0_8px_40px_rgba(74,222,128,0.15)]">
                <div className="bg-card/50 h-full rounded-xl p-6 flex flex-col">
                  <div className="h-12 w-12 rounded-lg bg-green-500/10 flex items-center justify-center mb-4 text-green-400">
                    <Brain className="h-6 w-6" />
                  </div>
                  <h3 className="font-display text-xl font-bold mb-2">Multiple AI Models</h3>
                  <p className="text-muted-foreground text-sm mb-6 flex-grow">
                    Choose from OpenAI GPT-4, Anthropic Claude, or Google Gemini. Use your own API keys.
                  </p>
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
                <Code className="h-5 w-5" />
              </div>
              <h4 className="font-medium">File Operations</h4>
            </div>
            <div className="flex flex-col items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-purple-500/10 flex items-center justify-center text-purple-400">
                <Terminal className="h-5 w-5" />
              </div>
              <h4 className="font-medium">Shell Commands</h4>
            </div>
            <div className="flex flex-col items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-green-500/10 flex items-center justify-center text-green-400">
                <Rocket className="h-5 w-5" />
              </div>
              <h4 className="font-medium">Deployment</h4>
            </div>
            <div className="flex flex-col items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-orange-500/10 flex items-center justify-center text-orange-400">
                <Shield className="h-5 w-5" />
              </div>
              <h4 className="font-medium">No Limits</h4>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-white/5">
        <div className="container mx-auto px-6 text-center text-sm text-muted-foreground">
          <p>DANIEL AI DEV - Your Personal AI Coding Assistant</p>
        </div>
      </footer>
    </div>
  );
}
