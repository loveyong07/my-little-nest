export function SectionHeading({ icon: Icon, id = undefined, children }) {
  return (
    <div className="section-heading chapter-heading" data-reveal>
      <Icon aria-hidden="true" />
      <h2 id={id} tabIndex={id ? -1 : undefined}>
        {children}
      </h2>
    </div>
  );
}
