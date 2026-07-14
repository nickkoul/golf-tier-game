import type { Route } from './+types/home';

export function meta(_: Route.MetaArgs) {
  return [{ title: 'Golf Tier Game' }];
}

export default function Home() {
  return <main>Golf Tier Game</main>;
}
