// Small inline drawings in desktop whitespace; never part of the reading or tab order.
export function LetterSeaside() {
  return (
    <svg
      className="scrapbook-accent letter-seaside"
      viewBox="0 0 150 180"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path className="accent-dotted" d="M104 6c-31 7-8 29-26 39-14 8-35-3-38 12-2 10 15 12 21 4" />
      <path className="accent-pink" d="M115 24s-9-5-9-10a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 5-9 10-9 10Z" />
      <circle className="accent-ring" cx="89" cy="116" r="43" />
      <circle className="accent-dotted" cx="89" cy="116" r="37" />
      <path className="accent-paper" d="m64 126 11 13h31l12-13Z" />
      <path className="accent-blue" d="M87 87v35H65Z" />
      <path className="accent-paper" d="M92 96v26h21Z" />
      <path d="M87 84v42m5-30v30" />
      <path className="accent-pink" d="m88 85 12 3-12 4Z" />
      <path className="accent-waves" d="M59 145q7-5 14 0t14 0 14 0 14 0m-46 8q7-4 14 0t14 0 14 0" />
      <path className="accent-glint" d="M29 105v12m-6-6h12m92-36v8m-4-4h8" />
      <circle className="accent-dot" cx="30" cy="145" r="2" />
      <circle className="accent-dot" cx="130" cy="144" r="1.5" />
    </svg>
  );
}

export function RouteGarland({ page }) {
  return (
    <svg
      className="scrapbook-accent route-garland"
      viewBox="0 0 360 128"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path className="accent-string" d="M12 14q161 53 334-3" />
      <circle className="accent-dot" cx="12" cy="14" r="3" />
      <circle className="accent-dot" cx="346" cy="11" r="3" />
      <path className="accent-string" d="M58 27v19m77-9v15m86-16v26m73-38v20" />
      <path className="accent-paper" d="m58 44 4.5 9 10 1.5-7.3 7 1.7 10L58 67l-8.9 4.5 1.7-10-7.3-7 10-1.5Z" />
      <g className="garland-medallion">
        <circle className="accent-paper" cx="135" cy="74" r="22" />
        {page === "posts" ? (
          <path d="M135 60v28m-12-21 24 14m-24 0 24-14m-16-4 4 4 4-4m-8 22 4-4 4 4m-15-11 5-1-1-5m14 18-1-5 5-1m-22 1 5 1-1 5m14-18-1 5 5 1" />
        ) : (
          <>
            <path className="accent-blue" d="m120 72 29-9-11 25-5-11Z" />
            <path d="m133 77 16-14" />
          </>
        )}
      </g>
      <g className="garland-postcard">
        <rect className="accent-paper" x="196" y="62" width="54" height="38" rx="4" />
        <path className="accent-blue" d="m198 65 25 18 25-18" />
        <path d="m198 96 15-13m35 13-15-13" />
        <path className="accent-pink" d="M223 86s-6-3-6-7a3.5 3.5 0 0 1 6-2 3.5 3.5 0 0 1 6 2c0 4-6 7-6 7Z" />
      </g>
      <path className="accent-blue" d="m294 45 4 8 9 1.5-6.5 6.3 1.5 9-8-4.3-8 4.3 1.5-9-6.5-6.3 9-1.5Z" />
      <path className="accent-glint" d="M91 88v9m-4.5-4.5h9m178 9v10m-5-5h10" />
      <circle className="accent-dot" cx="177" cy="111" r="2" />
    </svg>
  );
}

export function ContactPostcard() {
  return (
    <svg
      className="scrapbook-accent contact-postcard"
      viewBox="0 0 260 90"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path className="accent-dotted" d="M10 65c23 16 55 10 54-9-1-14-22-14-21-1 2 22 73 23 108-4" />
      <g className="contact-postcard-envelope">
        <rect className="accent-paper" x="73" y="22" width="90" height="53" rx="5" />
        <path className="accent-blue" d="m75 71 31-25h23l32 25" />
        <path className="accent-paper" d="m75 25 37 27a10 10 0 0 0 12 0l37-27" />
        <circle className="accent-pink" cx="118" cy="54" r="9" />
        <path className="accent-paper" d="M118 59s-6-3-6-7a3.5 3.5 0 0 1 6-2 3.5 3.5 0 0 1 6 2c0 4-6 7-6 7Z" />
      </g>
      <g className="contact-postcard-stamp">
        <circle className="accent-ring" cx="199" cy="30" r="23" />
        <circle className="accent-dotted" cx="199" cy="30" r="18" />
        <path className="accent-pink" d="M199 39s-11-6-11-13a6 6 0 0 1 11-3 6 6 0 0 1 11 3c0 7-11 13-11 13Z" />
        <path className="accent-waves" d="M215 45c10-7 17 4 28-2m-25 9c10-7 17 4 28-2m-25 9c10-7 17 4 28-2" />
      </g>
      <path className="accent-glint" d="M49 23v12m-6-6h12m123 37v9m-4.5-4.5h9" />
      <circle className="accent-dot" cx="31" cy="43" r="2" />
      <circle className="accent-dot" cx="230" cy="74" r="2" />
    </svg>
  );
}
