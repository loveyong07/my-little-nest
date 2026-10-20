export function CopyFallback({ value, message, label, inputRef }) {
  return (
    <div className="contact-copy-fallback" role="status">
      <p>{message}</p>
      <input
        ref={inputRef}
        type="text"
        readOnly
        value={value}
        aria-label={label}
        onFocus={(event) => event.currentTarget.select()}
        onClick={(event) => event.currentTarget.select()}
      />
    </div>
  );
}

export function ContactTile({
  icon: Icon,
  className,
  title,
  sub,
  href,
  onClick,
  copyLabel,
  copied,
  action,
  failedId,
  failureMessage,
  manualCopyLabel,
  inputRef,
}) {
  const Tag = href ? "a" : "button";
  return (
    <>
      <Tag
        className={`contact-tile ${className}${copied ? " is-copied" : ""}`}
        href={href}
        target={href?.startsWith("https://") ? "_blank" : undefined}
        rel={href?.startsWith("https://") ? "noopener noreferrer" : undefined}
        onClick={onClick}
        type={href ? undefined : "button"}
        title={copyLabel}
        aria-label={copyLabel || undefined}
      >
        <span className="contact-icon" aria-hidden="true">
          <Icon />
        </span>
        <strong>{title}</strong>
        <small aria-live={onClick ? "polite" : undefined} aria-atomic={onClick ? "true" : undefined}>
          {copied ? copied : sub}
        </small>
        <span className="contact-action">{copied || action}</span>
      </Tag>
      {failedId && (
        <CopyFallback value={failedId} message={failureMessage} label={manualCopyLabel} inputRef={inputRef} />
      )}
    </>
  );
}
