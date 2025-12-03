import ZetaSetupCore from '../ZetaSetupCore';

export default function Page() {
  return (
    <ZetaSetupCore
      title="Zeta Trainer"
      blurb="Plan workouts, track progress, and get adaptive coaching with your AI training partner."
      logo="/zeta-trainer.png"         // point to your trainer SVG/PNG
      templateSlug="zeta-trainer"      // or "trainer" — just be consistent everywhere
    />
  );
}
