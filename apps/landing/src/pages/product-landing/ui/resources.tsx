import type { LandingModel } from '../model/content';

type Resource = LandingModel['resources'][number];

export function ResourceLinks({ model }: { model: LandingModel }) {
  return (
    <section className="resource-links wrap" aria-label={model.copy.seo.resourcesTitle}>
      <h2>{model.copy.seo.resourcesTitle}</h2>
      <p>{model.copy.seo.resourcesIntro}</p>
      <div className="resource-list">
        {model.resources.map((resource) => (
          <article key={resource.id}>
            <h3>
              <a className="text-link" href={resource.href}>
                {resource.title}
              </a>
            </h3>
            <p>{resource.intro}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

export function ResourcePage({ model, resource }: { model: LandingModel; resource: Resource }) {
  const feature = model.features.find((item) => item.id === resource.featureId);
  return (
    <main className="feature-page resource-page wrap">
      <a className="text-link" href={model.home}>
        ← {model.copy.backHome}
      </a>
      <nav className="languages" aria-label={model.copy.language}>
        {model.languages.map((language) => (
          <a
            key={language.locale}
            lang={language.locale}
            href={`/${language.locale}/resources/${resource.id}/`}
            aria-current={language.locale === model.locale ? 'page' : undefined}
          >
            {language.label}
          </a>
        ))}
      </nav>
      <p className="eyebrow">Vakhta / {model.copy.seo.resourcesLabel}</p>
      <h1>{resource.title}</h1>
      <p className="feature-lead">{resource.intro}</p>
      <div className="feature-explanation">
        {resource.sections.map((section) => (
          <section key={section.title}>
            <h2>{section.title}</h2>
            <p>{section.body}</p>
          </section>
        ))}
        <section>
          <h2>{model.copy.seo.templateTitle}</h2>
          <ul className="template-fields">
            {resource.fields.map((field) => (
              <li key={field}>{field}</li>
            ))}
          </ul>
          <a className="button secondary" href={resource.downloadHref} download>
            {model.copy.seo.download}
          </a>
        </section>
        {feature && (
          <section>
            <h2>{model.copy.seo.related}</h2>
            <a className="text-link" href={feature.href}>
              {feature.label} →
            </a>
          </section>
        )}
      </div>
      <a className="button primary" href={model.actions[0]?.href}>
        {model.copy.pilotCta}
      </a>
    </main>
  );
}
