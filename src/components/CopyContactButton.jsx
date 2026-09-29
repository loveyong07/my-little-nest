import { useClipboard } from "../hooks/useClipboard.js";

export function CopyContactButton({
  textToCopy,
  label = "复制",
  copiedLabel = "已复制",
  className = "",
}) {
  const { copiedId, copyId } = useClipboard();
  const isCopied = copiedId === textToCopy;

  return (
    <button
      type="button"
      className={`copy-contact-btn ${className} ${isCopied ? "is-copied" : ""}`}
      onClick={() => copyId(textToCopy)}
      aria-live="polite"
    >
      {isCopied ? copiedLabel : label}
    </button>
  );
}
