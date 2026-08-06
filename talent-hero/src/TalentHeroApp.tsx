import { Navbar } from './Navbar';
import { BackgroundVideo } from './BackgroundVideo';
import { Hero } from './Hero';
import './index.css';

export function TalentHeroApp() {
  return (
    <div className="relative h-screen w-full overflow-hidden bg-white">
      <BackgroundVideo />
      <Navbar />
      <Hero />
    </div>
  );
}