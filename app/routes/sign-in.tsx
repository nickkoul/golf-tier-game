import { Form, useNavigation, useSearchParams } from 'react-router';

export default function SignIn() {
  const navigation = useNavigation();
  const [searchParams] = useSearchParams();
  const invalidLink = searchParams.get('error') === 'invalid-link';
  const emailUnavailable = searchParams.get('error') === 'email-unavailable';
  const emailFailed = searchParams.get('error') === 'email-failed';
  const sent = searchParams.get('sent') === '1';
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
      <div className="auth-layout">
        <section className="auth-card" aria-labelledby="sign-in-heading">
          <p className="eyebrow">Play Golf Tiers</p>
          <h1 id="sign-in-heading">Make Sunday interesting.</h1>
          <p>
            Pick your golfers, talk a little trash, and chase the top of the
            board with your crew.
          </p>
          {sent && (
            <p className="form-success" role="status">
              If that address can sign in, a link is on its way.
            </p>
          )}
          {invalidLink && (
            <p className="form-error" role="alert">
              That sign-in link is invalid, expired, or has already been used.
            </p>
          )}
          {emailUnavailable && (
            <p className="form-error" role="alert">
              Sign-in email is temporarily unavailable. Try again later.
            </p>
          )}
          {emailFailed && (
            <p className="form-error" role="alert">
              Unable to send a sign-in link. Try again.
            </p>
          )}
          <Form
            method="post"
            action="/api/auth/request"
            className="auth-form"
            reloadDocument
          >
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
            />
            <button
              className="button button-primary"
              type="submit"
              disabled={navigation.state !== 'idle'}
            >
              {navigation.state === 'idle'
                ? 'Email me a sign-in link'
                : 'Sending...'}
            </button>
          </Form>
        </section>

        <aside className="game-preview" aria-label="Golf Tiers game preview">
          <div className="preview-topline">
            <span className="status-dot live-dot" /> Live on Sunday
            <strong>Round 4</strong>
          </div>
          <p className="eyebrow">The weekend group</p>
          <h2>Blue Championship</h2>
          <p className="preview-course">TPC Colorado</p>
          <p className="preview-subtitle">
            Six picks. One bragging-rights board.
          </p>
          <ol className="preview-standings">
            <li>
              <span>1</span>
              <strong>Nick</strong>
              <b>428</b>
            </li>
            <li className="is-you">
              <span>2</span>
              <strong>Alex</strong>
              <b>414</b>
            </li>
            <li>
              <span>3</span>
              <strong>George</strong>
              <b>401</b>
            </li>
          </ol>
          <p className="preview-footer">One birdie can change everything.</p>
        </aside>
      </div>
    </main>
  );
}
