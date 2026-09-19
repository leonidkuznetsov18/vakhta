import { ResourceLinks } from './resources';
import type { LandingModel } from '../model/content';

type Feature = LandingModel['features'][number];

export function ProductImage({
  src,
  fullSrc = src,
  alt,
  label,
  width,
  height,
}: {
  src: string;
  fullSrc?: string;
  alt: string;
  label: string;
  width: number;
  height: number;
}) {
  return (
    <figure className="product-image">
      <a data-expand-image href={fullSrc} aria-label={`${label}: ${alt}`}>
        <img src={src} alt={alt} width={width} height={height} loading="lazy" />
        <span className="image-zoom">
          {label} <span aria-hidden="true">⛶</span>
        </span>
      </a>
    </figure>
  );
}

function FeatureStory({ feature, model }: { feature: Feature; model: LandingModel }) {
  const copy = model.copy.tour;
  return (
    <article id={`feature-${feature.id}`} className={`feature-story feature-${feature.id}`}>
      <div className="feature-copy">
        <p className="eyebrow">{feature.label}</p>
        <h3>{feature.title}</h3>
        <p>{feature.body}</p>
        <p className="feature-value">
          <strong>{copy.benefit}</strong>
          {feature.value}
        </p>
        <a className="text-link" href={feature.href}>
          {copy.how} <span aria-hidden="true"> →</span>
        </a>
      </div>
      <div>
        <ProductImage
          src={feature.image}
          alt={feature.label}
          label={copy.zoom}
          width={feature.width}
          height={feature.height}
        />
        <p className="evidence-note">{feature.caption}</p>
      </div>
    </article>
  );
}

export function FeatureCatalog({ model }: { model: LandingModel }) {
  const copy = model.copy.tour;
  return (
    <section id="capabilities" className="section feature-catalog">
      <div className="wrap">
        <div className="section-intro">
          <h2>{copy.title}</h2>
          <p>{copy.body}</p>
        </div>
        <nav className="feature-nav" aria-label={copy.title}>
          {model.features.map((feature) => (
            <a key={feature.id} href={feature.href}>
              {feature.label} <span aria-hidden="true">↗</span>
            </a>
          ))}
        </nav>
        <p className="evidence-note">{model.copy.demoNote}</p>
        {model.features.slice(0, 5).map((feature) => (
          <FeatureStory key={feature.id} feature={feature} model={model} />
        ))}
        <h3 className="more-heading">{copy.more}</h3>
        <div className="supporting-features">
          {model.features.slice(5).map((feature) => (
            <details key={feature.id}>
              <summary>
                {feature.label}
                <span>{feature.title}</span>
              </summary>
              <FeatureStory feature={feature} model={model} />
            </details>
          ))}
        </div>
        <p className="boundary-note">{model.copy.lossLimit}</p>
      </div>
    </section>
  );
}

export function ProcessTour({ model }: { model: LandingModel }) {
  const copy = model.copy.tour;
  return (
    <section id="workflow" className="section process-section">
      <div className="wrap">
        <div className="section-intro">
          <h2>{copy.flowTitle}</h2>
          <p>{copy.flowBody}</p>
        </div>
        <div className="process-tour">
          <fieldset className="process-controls">
            <legend>{copy.how}</legend>
            {copy.flow.map((step, index) => (
              <label key={step.id}>
                <input type="radio" name="process" value={step.id} defaultChecked={index === 0} />
                <span>{step.title}</span>
              </label>
            ))}
          </fieldset>
          {copy.flow.map((step) => (
            <div key={step.id} className="process-stage" data-process={step.id}>
              <div className="process-devices">
                {[
                  { image: '/product/kiosk-uk.webp', text: step.kiosk },
                  { image: '/product/telegram-uk.webp', text: step.telegram },
                  { image: step.image, text: step.panel },
                ].map((surface, index) => (
                  <div className="process-device" key={surface.image}>
                    <p className="eyebrow">{copy.surfaces[index]}</p>
                    <img src={surface.image} alt="" loading="lazy" width="560" height="360" />
                    <strong>{surface.text}</strong>
                  </div>
                ))}
              </div>
              <p className="process-explanation">{step.body}</p>
              <a
                className="text-link step-expand"
                href="#workflow"
                data-expand-step
                data-step-title={step.title}
              >
                {copy.zoom} ⛶
              </a>
            </div>
          ))}
        </div>
        <p className="evidence-note">{copy.flowNote}</p>
      </div>
    </section>
  );
}

export function WorkerBot({ model }: { model: LandingModel }) {
  const copy = model.copy.tour;
  return (
    <section id="worker" className="section bot-section wrap">
      <div>
        <p className="eyebrow">Telegram</p>
        <h2>{copy.botTitle}</h2>
        <p>{copy.botBody}</p>
        <ol className="bot-journey">
          {copy.botSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>
      <div className="bot-evidence">
        <ProductImage
          src="/product/telegram-uk.webp"
          alt={model.copy.productScreens.telegram}
          label={copy.zoom}
          width={560}
          height={230}
        />
        <p className="evidence-note">{model.copy.productScreens.telegramCaption}</p>
      </div>
    </section>
  );
}

function FeatureExplanation({ feature }: { feature: Feature }) {
  if (!feature.detail) return null;
  return (
    <div className="feature-explanation">
      {feature.detail.sections.map((section) => (
        <section key={section.title}>
          <h2>{section.title}</h2>
          <p>{section.body}</p>
        </section>
      ))}
    </div>
  );
}

export function FeaturePage({ model, feature }: { model: LandingModel; feature: Feature }) {
  const copy = model.copy.tour;
  return (
    <>
      {' '}
      <main className="feature-page wrap">
        <a className="text-link" href={`${model.home}#capabilities`}>
          ← {model.copy.backHome}
        </a>
        <nav className="languages" aria-label={model.copy.language}>
          {model.languages.map((language) => (
            <a
              key={language.locale}
              href={`/${language.locale}/features/${feature.id}/`}
              lang={language.locale}
              aria-current={language.locale === model.locale ? 'page' : undefined}
            >
              {language.label}
            </a>
          ))}
        </nav>
        <p className="eyebrow">Vakhta / {feature.label}</p>
        <h1>{feature.title}</h1>
        <p className="feature-lead">{feature.body}</p>
        <ProductImage
          src={feature.image}
          alt={feature.label}
          label={copy.zoom}
          width={feature.width}
          height={feature.height}
        />
        <p className="evidence-note">{feature.caption}</p>
        {feature.id === 'handover' && (
          <ProductImage
            src="/product/handover-live-uk.webp"
            alt={feature.label}
            label={copy.zoom}
            width={3134}
            height={771}
          />
        )}
        <div className="feature-detail">
          <div>
            <h2>{copy.how}</h2>
            <ol>
              {feature.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>
          <div>
            <h2>{copy.benefit}</h2>
            <p>{feature.value}</p>
            <a className="button primary" href={model.actions[0]?.href}>
              {model.copy.pilotCta}
            </a>
          </div>
        </div>
        <FeatureExplanation feature={feature} />
        <ResourceLinks model={model} />
        <nav className="feature-nav" aria-label={copy.more}>
          {model.features
            .filter((item) => item.id !== feature.id)
            .map((item) => (
              <a href={item.href} key={item.id}>
                {item.label} →
              </a>
            ))}
        </nav>
      </main>
      <MediaDialog model={model} />
    </>
  );
}

export function MediaDialog({ model }: { model: LandingModel }) {
  return (
    <dialog className="media-dialog" data-media-dialog aria-labelledby="media-heading">
      <header>
        <h2 id="media-heading" data-media-heading>
          {model.copy.tour.zoom}
        </h2>
        <div className="media-actions">
          <button type="button" className="button secondary" data-media-size aria-pressed="false">
            {model.copy.tour.actualSize}
          </button>
          <button type="button" className="button secondary" data-media-close autoFocus>
            {model.copy.tour.close} ×
          </button>
        </div>
      </header>
      <div className="media-content" data-media-content />
    </dialog>
  );
}
