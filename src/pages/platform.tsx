/**
 * The index: what a credential on this platform can be, before anybody has one.
 *
 * PUBLIC, because `GET /v1/scopes` is (`devplatform/src/server.ts`). The person this page is
 * written for has not signed in and is deciding whether to.
 *
 * It renders the scope vocabulary as a table rather than as prose, because the vocabulary IS the
 * product's authority model: exact match, no wildcard, no hierarchy, and an empty set that grants
 * nothing (`devplatform/src/scopes.ts`). A page that summarised it would be a second, prettier
 * copy that drifts.
 */
import { Link } from 'react-router-dom'
import { Empty, Failed, Loading, Note } from '../components/states.tsx'
import { useResource } from '../lib/resource.ts'
import { getScopes, KNOWN_GAPS } from '../lib/devplatform.ts'

export function PlatformPage() {
  const vocabulary = useResource(
    (signal) => getScopes(signal),
    (data) => data.scopes.length,
    'We could not reach the service that publishes the scope list.',
  )

  return (
    <section className="dp-page">
      <header className="dp-page__head">
        <h1 className="dp-page__title">Build on CloudsForge</h1>
        <p className="dp-page__lead">
          Underneath all of this is a chain that speaks Ethereum. Its virtual machine was written
          from scratch in our own source tree and is held to Ethereum’s published test vectors, so a
          Solidity contract you compiled for mainnet deploys here unchanged, and MetaMask, ethers,
          viem, Hardhat and Foundry address it as they would any other node. There is no translation
          layer between your tools and the chain, and no house SDK you have to adopt first.
        </p>
      </header>

      <div className="dp-cta">
        <Link className="cf-btn cf-btn--primary" to="/organisations">
          Enrol an organisation
        </Link>
        <Link className="cf-btn" to="/apps">
          Browse the directory
        </Link>
      </div>

      <h2 className="dp-h2">The v1 API, and the credential that opens it</h2>
      <p className="dp-para">
        Above the chain sits an HTTP API that the rest of the estate answers on. One credential
        opens all of it: an API key, presented as{' '}
        <code className="cf-num">Authorization: Bearer</code>. This console is the place an
        organisation enrols, a project comes into being, keys are minted against it, and the calls
        those keys make are counted against a limit you can see.
      </p>
      <p className="dp-para">
        A key’s secret is printed at the instant it is minted and at no later moment. We keep a
        scrypt hash of it and nothing else, so losing the value means issuing a replacement — no
        route recovers it, and neither can anybody who works here.
      </p>

      <h2 className="dp-h2">What answers on that host</h2>
      <p className="dp-para">
        Wallets and balances, the market, minting, pricing, account identity, the activity feed, the
        worlds service and Foresight are all mounted under the same <code className="cf-num">/v1</code>{' '}
        host and all read the same bearer token. You do not assemble a second credential to move
        between them.
      </p>
      <p className="dp-para">
        Two of those behave in a way worth knowing before you design around them.{' '}
        <strong>EMBER can be mined from a browser tab</strong> — a page points itself at the chain
        and the reward is paid to a key generated on their machine that never leaves it, with
        nothing to download.
        <strong> Foresight settles in the contract, not on our servers</strong>: a stake can be
        placed in Bitcoin, Ethereum, Litecoin, Solana, XRP, EMBER or any token launched on this
        chain, and a winner collects by calling the contract directly — which still works with every
        machine CloudsForge runs powered down.
      </p>

      <h2 className="dp-h2">How far a key’s authority reaches</h2>
      <p className="dp-para">
        Authority is written as scopes, and a scope names a service and an action instead of a URL,
        so <code className="cf-num">market:write</code> stays true when a route moves.{' '}
        <strong>Nothing is implied by anything else and there is no wildcard.</strong> Spell out
        every scope at issuance. A name the platform does not know stops the whole request rather
        than being quietly dropped, so a key can never come back holding less than you asked for.
        Asking for none is permitted, and gives you a credential that authenticates and is turned
        away everywhere.
      </p>

      {vocabulary.state === 'loading' && <Loading label="Asking which scopes exist" />}
      {vocabulary.state === 'failed' && vocabulary.error && (
        <Failed notice={vocabulary.error} onRetry={vocabulary.reload} />
      )}
      {vocabulary.state === 'forbidden' && vocabulary.error && (
        <Failed notice={vocabulary.error} title="The platform would not hand over its scope list" />
      )}
      {vocabulary.state === 'empty' && (
        <Empty
          title="The scope list came back with nothing in it"
          hint="The service replied; it simply named no scopes. This page has finished waiting. Until something is published here, a key minted in this console would authenticate and then be refused at every route it tried."
        />
      )}
      {vocabulary.state === 'ok' && vocabulary.data && (
        <>
          <div className="dp-tablewrap">
            <table className="dp-table">
              <caption className="dp-table__caption">
                The whole vocabulary, fetched as this page loaded from{' '}
                <code className="cf-num">GET /v1/scopes</code>. That route asks for no credential, so
                you can settle what a key needs before you own one.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Scope</th>
                  <th scope="col">Service</th>
                  <th scope="col">Kind</th>
                  <th scope="col">What it grants</th>
                </tr>
              </thead>
              <tbody>
                {vocabulary.data.scopes.map((scope) => (
                  <tr key={scope.name}>
                    <td>
                      <code className="cf-num">{scope.name}</code>
                    </td>
                    <td>{scope.service}</td>
                    <td>{scope.kind}</td>
                    <td>{scope.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Note>{vocabulary.data.note}</Note>
        </>
      )}

      <h2 className="dp-h2">Two limits worth knowing before you start</h2>
      <p className="dp-para">
        Better here than three days into an integration. Both are the platform as it stands today,
        not a plan, and both have something you can do about them.
      </p>
      <dl className="dp-gaps">
        {KNOWN_GAPS.map((gap) => (
          <div className="dp-gap" key={gap.id}>
            <dt className="dp-gap__title">{gap.title}</dt>
            <dd className="dp-gap__body">
              <p>{gap.finding}</p>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
