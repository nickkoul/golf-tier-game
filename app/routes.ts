import { index, route, type RouteConfig } from '@react-router/dev/routes';

export default [
  index('routes/home.tsx'),
  route('sign-in', 'routes/sign-in.tsx'),
  route('profile', 'routes/profile.tsx'),
  route('contests/new', 'routes/contests.new.tsx'),
  route('contests/:id', 'routes/contests.$id.tsx'),
  route('contests/:id/lineup', 'routes/contests.$id.lineup.tsx'),
  route('invitations', 'routes/invitations.tsx'),
] satisfies RouteConfig;
