import { Form, useLoaderData, useSearchParams } from 'react-router';
import { authenticatedUser } from '../services/auth.server';
import type { Route } from './+types/profile';

export async function loader({ request, context }: Route.LoaderArgs) {
  const { cloudflare } = context as { cloudflare: { env: { DB: D1Database } } };
  return authenticatedUser(request, cloudflare.env);
}

export default function Profile() {
  const [searchParams] = useSearchParams();
  const user = useLoaderData<typeof loader>();
  return (
    <main className="auth-page">
      <a
        className="wordmark auth-wordmark"
        href="/"
        aria-label="Golf Tiers home"
      >
        <span>GOLF</span>
        <strong>TIERS</strong>
      </a>
      <section className="auth-card" aria-labelledby="profile-heading">
        <p className="eyebrow">Your account</p>
        <h1 id="profile-heading">Profile</h1>
        <p>Set the name Contest Participants will see.</p>
        <p className="profile-email">{user?.email}</p>
        {searchParams.get('saved') === '1' && (
          <p className="form-success" role="status">
            Display name saved.
          </p>
        )}
        <Form
          method="post"
          action="/api/profile"
          className="auth-form"
          reloadDocument
        >
          <label htmlFor="display-name">Display name</label>
          <input
            id="display-name"
            name="displayName"
            autoComplete="name"
            required
            maxLength={80}
            defaultValue={user?.displayName}
          />
          <button className="button button-primary" type="submit">
            Save display name
          </button>
        </Form>
      </section>
    </main>
  );
}
