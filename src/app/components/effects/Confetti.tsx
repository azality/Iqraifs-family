import { motion } from "motion/react";
import { useEffect, useState } from "react";

interface ConfettiProps {
  trigger: boolean;
  onComplete?: () => void;
}

export function Confetti({ trigger, onComplete }: ConfettiProps) {
  const [particles, setParticles] = useState<Array<{ id: number; x: number; y: number; color: string; rotation: number; delay: number }>>([]);

  useEffect(() => {
    if (trigger) {
      // Generate 30 confetti particles
      const newParticles = Array.from({ length: 30 }).map((_, i) => ({
        id: i,
        x: Math.random() * window.innerWidth,
        y: -20 - Math.random() * 50,
        color: [
          "#F4C430", // Gold
          "#FF6B6B", // Red
          "#4ECDC4", // Teal
          "#95E1D3", // Mint
          "#F38181", // Pink
          "#AA96DA", // Purple
        ][Math.floor(Math.random() * 6)],
        rotation: Math.random() * 360,
        delay: Math.random() * 0.3,
      }));

      setParticles(newParticles);

      // Clear after animation
      const timer = setTimeout(() => {
        setParticles([]);
        onComplete?.();
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [trigger, onComplete]);

  if (particles.length === 0) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      {particles.map((particle) => (
        <motion.div
          key={particle.id}
          initial={{
            x: particle.x,
            y: particle.y,
            rotate: particle.rotation,
            opacity: 1,
          }}
          animate={{
            y: window.innerHeight + 100,
            rotate: particle.rotation + 360 * 3,
            opacity: [1, 1, 0.5, 0],
          }}
          transition={{
            duration: 2.5,
            delay: particle.delay,
            ease: "easeIn",
          }}
          style={{
            position: "absolute",
            width: "10px",
            height: "10px",
            backgroundColor: particle.color,
            borderRadius: Math.random() > 0.5 ? "50%" : "0%",
          }}
        />
      ))}
    </div>
  );
}
