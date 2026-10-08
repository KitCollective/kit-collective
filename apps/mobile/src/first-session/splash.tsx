import { SplashScreen } from "@/first-session/splash-screen";

type SplashViewProps = {
  onContinue: () => void;
  onLogin: () => void;
  onRegister: () => void;
};

/** Host adapter — visual lock lives in splash-screen.tsx. */
export function SplashView({ onContinue, onLogin, onRegister }: SplashViewProps) {
  return <SplashScreen onContinue={onContinue} onOpenLogin={onLogin} onOpenRegister={onRegister} />;
}
