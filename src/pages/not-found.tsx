/**
 * The page an unknown address renders — **under a real 404**.
 *
 * nginx enumerates this app's routes and lets everything else fall through to
 * `error_page 404 /index.html`, which serves this bundle while KEEPING the 404 status. The usual
 * `try_files $uri /index.html` would answer 200 for every address in existence, which makes "page
 * not found" a success: crawlers index it, uptime checks call it healthy, and a deploy that drops a
 * route looks exactly like a deploy that did not.
 *
 * So this component renders inside the shell, with the navigation intact, and says what happened
 * rather than pretending the address was fine.
 */
import { Link } from 'react-router-dom'
import { NAV } from '../lib/routes.ts'

export function NotFoundPage() {
  return (
    <section className="dp-page">
      <div className="dp-state dp-state--empty" role="status">
        <span className="dp-state__icon" aria-hidden="true">
          ◇
        </span>
        <p className="dp-state__title">No page exists at this address</p>
        <p className="dp-state__hint">
          Our server returned a genuine 404, and you are reading the app drawn beneath it. Plenty of
          sites answer every URL with a success and then show a message like this one; we would
          rather your tools, and ours, could tell the difference. Pick up a thread again below.
        </p>
        <div className="dp-state__action">
          {NAV.map((item) => (
            <Link key={item.to} className="cf-btn" to={item.to}>
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
