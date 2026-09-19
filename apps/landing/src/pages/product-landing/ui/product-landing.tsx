import { ResourceLinks } from './resources';
import type { LandingModel } from '../model/content';
import { FeatureCatalog, ProcessTour, WorkerBot, ProductImage, MediaDialog } from './product-tour';

type Block = { title: string; body: string };

function SectionIntro({ block }: { block: Block }) {
  return (
    <div className="section-intro">
      <h2>{block.title}</h2>
      <p>{block.body}</p>
    </div>
  );
}

function ContactActions({ actions }: { actions: LandingModel['actions'] }) {
  return (
    <div className="contact-actions">
      {actions.map((action) => (
        <a key={action.intent} className={action.className} href={action.href}>
          {action.label}
        </a>
      ))}
    </div>
  );
}

function LanguageLinks({ model }: { model: LandingModel }) {
  return (
    <nav className="languages" aria-label={model.copy.language}>
      {model.languages.map((language) => (
        <a
          key={language.locale}
          href={language.path}
          lang={language.locale}
          hrefLang={language.locale}
          data-locale-path={language.path}
          aria-current={model.locale === language.locale ? 'page' : undefined}
        >
          {language.label}
        </a>
      ))}
    </nav>
  );
}

function Steps({ items, className }: { items: Block[]; className: string }) {
  return (
    <ol className={className}>
      {items.map((item) => (
        <li key={item.title}>
          <h3>{item.title}</h3>
          <p>{item.body}</p>
        </li>
      ))}
    </ol>
  );
}

function PageHeader({ model }: { model: LandingModel }) {
  const { copy } = model;
  return (
    <header className="site-header wrap">
      <a className="brand" href="/" aria-label="Vakhta">
        <span className="brand-mark" aria-hidden="true">
          V
        </span>
        vakhta
      </a>
      <nav className="main-nav" aria-label={copy.readWorkflow}>
        <a href="#workflow">{copy.nav.workflow}</a>
        <a href="#capabilities">{copy.nav.capabilities}</a>
        <a href="#pilot">{copy.nav.pilot}</a>
        <a href="#faq">{copy.nav.faq}</a>
      </nav>
      <a className="sign-in" href="https://panel.vakhta.xyz">
        {copy.signIn}
        <span aria-hidden="true"> ↗</span>
      </a>
      <LanguageLinks model={model} />
    </header>
  );
}

function Hero({ model }: { model: LandingModel }) {
  const { copy, actions } = model;
  return (
    <section id="top" className="hero wrap">
      <div className="hero-copy">
        <p className="audience">{copy.audience}</p>
        <h1>{copy.hero}</h1>
        <p className="intro">{copy.intro}</p>
        <ContactActions actions={actions} />
        <p className="hero-note">{copy.heroNote}</p>
        <a className="text-link" href="#workflow">
          {copy.readWorkflow}
        </a>
      </div>
      <div className="portrait-field">
        {model.portraits.map((portrait) => (
          <img
            key={portrait.profession}
            className={`portrait portrait-${portrait.profession}`}
            src={portrait.src}
            alt={portrait.alt}
            width="320"
            height="320"
          />
        ))}
      </div>
      <p className="portrait-note">{copy.portraitNote}</p>
    </section>
  );
}

function ProductScreens({ model }: { model: LandingModel }) {
  const copy = model.copy.tour;
  return (
    <section id="product" className="product-overview wrap">
      <p className="eyebrow">{copy.overview}</p>
      <ProductImage
        src="/product/overview-uk.webp"
        fullSrc="/product/overview-full-uk.webp"
        alt={copy.overview}
        label={copy.zoom}
        width={1185}
        height={790}
      />
      <p className="evidence-note">{copy.evidence}</p>
    </section>
  );
}

function Problem({ model }: { model: LandingModel }) {
  const { copy } = model;
  return (
    <section id="problem" className="section pale">
      <div className="wrap">
        <SectionIntro block={copy.problem} />
        <div className="three-columns problems">
          {copy.problems.map((problem) => (
            <article key={problem.title}>
              <h3>{problem.title}</h3>
              <p>{problem.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Teams({ model }: { model: LandingModel }) {
  const { copy } = model;
  return (
    <section id="teams" className="section wrap">
      <SectionIntro block={copy.teams} />
      <div className="three-columns roles">
        {copy.roles.map((role) => (
          <article key={role.title}>
            <h3>{role.title}</h3>
            <p>{role.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function Demo({ model }: { model: LandingModel }) {
  const { copy, actions } = model;
  return (
    <section id="demo" className="section demo-section">
      <div className="wrap split">
        <div>
          <SectionIntro block={copy.demo} />
          <a className={actions[1]?.className} href={actions[1]?.href}>
            {copy.demoCta}
          </a>
        </div>
        <div>
          <ol className="demo-steps">
            {copy.demoSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <p className="small">{copy.demoNote}</p>
        </div>
      </div>
    </section>
  );
}

function Pilot({ model }: { model: LandingModel }) {
  const { copy, actions } = model;
  return (
    <section id="pilot" className="section wrap">
      <SectionIntro block={copy.pilot} />
      <Steps items={copy.pilotSteps} className="pilot-steps" />
      <p className="boundary-note">{copy.pilotNote}</p>
      <a className={actions[0]?.className} href={actions[0]?.href}>
        {copy.pilotCta}
      </a>
    </section>
  );
}

function Trust({ model }: { model: LandingModel }) {
  const { copy } = model;
  return (
    <section id="trust" className="section pale">
      <div className="wrap split">
        <SectionIntro block={copy.trust} />
        <ul className="trust-points">
          {copy.trustPoints.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Investors({ model }: { model: LandingModel }) {
  const { copy, actions } = model;
  return (
    <section id="investors" className="investor-section wrap">
      <div>
        <h2>{copy.investors.title}</h2>
        <p>{copy.investors.body}</p>
      </div>
      <a className={actions[2]?.className} href={actions[2]?.href}>
        {copy.investorCta}
      </a>
    </section>
  );
}

function Questions({ model }: { model: LandingModel }) {
  const { copy } = model;
  return (
    <section id="faq" className="section faq-section wrap">
      <h2>{copy.faq}</h2>
      <div>
        {copy.questions.map((question) => (
          <details key={question.title}>
            <summary>{question.title}</summary>
            <p>{question.body}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function Contact({ model }: { model: LandingModel }) {
  const { copy, actions, contact } = model;
  return (
    <section id="contact" className="section contact-section">
      <div className="wrap">
        <SectionIntro block={copy.contact} />
        <p>{copy.contactHint}</p>
        <a className="text-link" href={`/${model.locale}/brief.txt`} download>
          {copy.download}
        </a>
        <ContactActions actions={actions} />
        {contact ? (
          <p className="small">{copy.emailHint}</p>
        ) : (
          <p className="contact-pending">{copy.contactPending}</p>
        )}
      </div>
    </section>
  );
}

function PageFooter({ model }: { model: LandingModel }) {
  const { copy, contact } = model;
  return (
    <footer className="site-footer wrap">
      <div className="footer-top">
        <a className="brand" href="/">
          vakhta
        </a>
        <p>{copy.footer}</p>
        <LanguageLinks model={model} />
      </div>
      {contact?.operator && (
        <p>
          {copy.operator}: {contact.operator}
        </p>
      )}
      <p className="small privacy">{copy.privacy}</p>
    </footer>
  );
}

export function ProductLanding({ model, preview }: { model: LandingModel; preview: boolean }) {
  const { copy } = model;
  return (
    <>
      <a className="skip-link" href="#main">
        {copy.skip}
      </a>
      {preview && <aside className="preview-notice">{copy.preview}</aside>}
      <PageHeader model={model} />
      <main id="main">
        <Hero model={model} />
        <ProductScreens model={model} />
        <Problem model={model} />
        <ProcessTour model={model} />
        <FeatureCatalog model={model} />
        <WorkerBot model={model} />
        <Teams model={model} />
        <Demo model={model} />
        <Pilot model={model} />
        <Trust model={model} />
        <Investors model={model} />
        <ResourceLinks model={model} />
        <Questions model={model} />
        <Contact model={model} />
      </main>
      <PageFooter model={model} />
      <MediaDialog model={model} />
    </>
  );
}
