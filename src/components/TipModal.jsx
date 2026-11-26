import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FiCheck, FiCopy, FiX } from "react-icons/fi";
import { TIP_YUKI_IMAGE, tipChannels } from "../constants/site.js";
import { useClipboard } from "../hooks/useClipboard.js";

export function TipModal({ t, onClose, returnFocusRef }) {
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const yukiButtonRef = useRef(null);
  const yukiCloseRef = useRef(null);
  const wasYukiOpenRef = useRef(false);
  const { copiedId, copyFailedId, manualCopyRef, copyId } = useClipboard();
  const [activeCopyChannel, setActiveCopyChannel] = useState("");
  const [yukiPreviewOpen, setYukiPreviewOpen] = useState(false);

  const closeModal = useCallback(() => {
    onClose();
  }, [onClose]);

  const closeYukiPreview = useCallback(() => {
    setYukiPreviewOpen(false);
  }, []);

  useEffect(() => {
    const returnFocus = returnFocusRef?.current;
    const root = document.getElementById("root");
    const previousOverflow = document.body.style.overflow;
    const previousInert = root?.inert;
    const previousAriaHidden = root?.getAttribute("aria-hidden");
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    if (root) {
      root.inert = true;
      root.setAttribute("aria-hidden", "true");
    }
    return () => {
      document.body.style.overflow = previousOverflow;
      if (root) {
        root.inert = Boolean(previousInert);
        if (previousAriaHidden === null) root.removeAttribute("aria-hidden");
        else root.setAttribute("aria-hidden", previousAriaHidden);
      }
      returnFocus?.focus();
    };
  }, [returnFocusRef]);

  useEffect(() => {
    if (yukiPreviewOpen) {
      wasYukiOpenRef.current = true;
      yukiCloseRef.current?.focus();
    } else if (wasYukiOpenRef.current) {
      wasYukiOpenRef.current = false;
      yukiButtonRef.current?.focus();
    }
  }, [yukiPreviewOpen]);

  useEffect(() => {
    function handleKeyDown(event) {
      if (yukiPreviewOpen) {
        if (event.key === "Escape") {
          event.preventDefault();
          closeYukiPreview();
        } else if (event.key === "Tab") {
          event.preventDefault();
          yukiCloseRef.current?.focus();
        }
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        closeModal();
      } else if (event.key === "Tab") {
        if (!dialogRef.current?.contains(document.activeElement)) {
          event.preventDefault();
          closeRef.current?.focus();
          return;
        }
        const focusable = [
          ...dialogRef.current.querySelectorAll(
            "button:not(:disabled), input, a[href], [tabindex]:not([tabindex='-1'])",
          ),
        ].filter((element) => {
          if (element.closest('[aria-hidden="true"]')) return false;
          const style = window.getComputedStyle(element);
          return style.display !== "none" && style.visibility !== "hidden";
        });
        const first = focusable[0];
        const last = focusable.at(-1);
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [yukiPreviewOpen, closeModal, closeYukiPreview]);

  return createPortal(
    <>
      <div
        className="tip-modal-backdrop"
        role="presentation"
        aria-hidden={yukiPreviewOpen ? "true" : undefined}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeModal();
        }}
      >
        <div
          className="tip-modal-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="tip-modal-title"
          ref={dialogRef}
        >
          <button
            ref={closeRef}
            type="button"
            className="tip-modal-close"
            aria-label={t.tipClose}
            title={t.tipClose}
            onClick={closeModal}
          >
            <FiX aria-hidden="true" />
          </button>
          <div className="tip-modal-header">
            <button
              ref={yukiButtonRef}
              type="button"
              className="tip-yuki-button"
              aria-label={t.tipYukiPreview}
              title={t.tipYukiPreview}
              onClick={() => setYukiPreviewOpen(true)}
            >
              <img src={TIP_YUKI_IMAGE} alt={t.tipYukiAlt} decoding="async" />
            </button>
            <h2 className="tip-modal-title" id="tip-modal-title">
              {t.tipModalTitle}
            </h2>
          </div>
          <div className="tip-qr-grid">
            {tipChannels.map((channel) => {
              const isCopied = Boolean(
                channel.address && copiedId === channel.address && activeCopyChannel === channel.id,
              );
              const showFallback = Boolean(
                channel.address && copyFailedId === channel.address && activeCopyChannel === channel.id,
              );
              return (
                <div className="tip-qr-card" key={channel.id}>
                  <span className={`tip-qr-label tip-qr-label-${channel.tone}`}>{channel.label}</span>
                  <div className="tip-qr-frame">
                    <img src={channel.qr} alt={t.tipQrAlt(channel.label)} loading="eager" decoding="async" />
                  </div>
                  {channel.address && (
                    <>
                      <button
                        type="button"
                        className={`tip-wallet-copy${isCopied ? " is-copied" : ""}`}
                        aria-label={`${channel.label} ${t.tipCopyAddress}`}
                        onClick={() => {
                          setActiveCopyChannel(channel.id);
                          copyId(channel.address);
                        }}
                      >
                        <span>{channel.address}</span>
                        <span className="tip-wallet-copy-status">
                          {isCopied ? <FiCheck aria-hidden="true" /> : <FiCopy aria-hidden="true" />}
                          {isCopied ? t.tipAddressCopied : t.tipCopyAddress}
                        </span>
                      </button>
                      {showFallback && (
                        <input
                          ref={manualCopyRef}
                          type="text"
                          readOnly
                          className="tip-wallet-fallback"
                          aria-label={`${channel.label} ${t.tipCopyAddress}`}
                          value={channel.address}
                        />
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {yukiPreviewOpen && (
        <div
          className="tip-yuki-lightbox"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeYukiPreview();
          }}
        >
          <div className="tip-yuki-lightbox-content" role="dialog" aria-modal="true" aria-label={t.tipYukiPreview}>
            <img className="tip-yuki-lightbox-image" src={TIP_YUKI_IMAGE} alt={t.tipYukiAlt} />
            <button
              ref={yukiCloseRef}
              type="button"
              className="tip-yuki-lightbox-close"
              aria-label={t.tipYukiClose}
              title={t.tipYukiClose}
              onClick={closeYukiPreview}
            >
              <FiX aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </>,
    document.body,
  );
}
