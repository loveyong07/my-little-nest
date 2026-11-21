export function SectionHeading({ icon: Icon, number, kicker, id = undefined, children }) {
  return (
    <div className="section-heading chapter-heading" data-reveal>
      <span className="chapter-number" aria-hidden="true">
        {number}
      </span>
      <Icon aria-hidden="true" />
      <div>
        <span className="chapter-kicker" aria-hidden="true">
          {kicker}
        </span>
        <h2 id={id} tabIndex={id ? -1 : undefined}>
          {children}
        </h2>
      </div>
    </div>
  );
}
