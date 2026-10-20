// Scene ornaments only: no text, focus targets, requests or pointer listeners.
export function DesktopStationery({ page = "home" }) {
  return (
    <div className={"desktop-stationery desktop-stationery-" + page} aria-hidden="true">
      <svg className="stationery-chime" viewBox="0 0 120 220" fill="none" focusable="false">
        <g className="stationery-thread">
          <circle cx="60" cy="9" r="5" />
          <path d="M60 14v25M20 55Q60 30 100 55M23 54v45M60 40v110M97 54v72" />
          <circle cx="23" cy="82" r="3" className="stationery-pearl" />
          <circle cx="60" cy="111" r="4" className="stationery-pearl" />
          <circle cx="97" cy="98" r="3" className="stationery-pearl" />
        </g>
        <path
          className="stationery-paper"
          d="m23 99 4.6 9.3 10.3 1.5-7.5 7.3 1.8 10.3-9.2-4.9-9.2 4.9 1.8-10.3-7.5-7.3 10.3-1.5Z"
        />
        <path
          className="stationery-paper"
          d="m97 126 3.7 7.5 8.3 1.2-6 5.8 1.4 8.2-7.4-3.9-7.4 3.9 1.4-8.2-6-5.8 8.3-1.2Z"
        />
        <circle className="stationery-thread" cx="60" cy="174" r="24" />
        <path
          className="stationery-paper"
          d="m60 153 5.9 12 13.3 1.9-9.6 9.4 2.3 13.2-11.9-6.2-11.9 6.2 2.3-13.2-9.6-9.4 13.3-1.9Z"
        />
        <path className="stationery-thread" d="M60 198v12m-4 0h8" />
        <circle className="stationery-pearl" cx="60" cy="212" r="3" />
      </svg>

      <svg className="stationery-airmail" viewBox="0 0 200 150" fill="none" focusable="false">
        <path className="stationery-trail" d="M12 129c56 17 100-11 85-39-13-23-44-9-30 11 16 24 56 2 65-30" />
        <g className="stationery-plane">
          <path className="stationery-paper" d="m104 41 77-25-29 68-13-28Z" />
          <path className="stationery-fold" d="m139 56 42-40-29 68Z" />
          <path className="stationery-thread" d="m104 41 77-25-42 40 13 28" />
          <path className="stationery-paper" d="m139 56-2 18 15-10" />
        </g>
        <g className="stationery-glints">
          <path d="M36 51v12m-6-6h12m114 49v10m-5-5h10" />
          <circle cx="57" cy="32" r="2" />
          <circle cx="178" cy="91" r="2" />
        </g>
      </svg>

      <svg className="stationery-letter" viewBox="0 0 180 140" fill="none" focusable="false">
        <g className="stationery-postmark">
          <circle cx="130" cy="33" r="25" />
          <circle cx="130" cy="33" r="20" strokeDasharray="1 4" />
          <path d="m130 20 3.8 7.7 8.5 1.2-6.2 6 1.5 8.5-7.6-4-7.6 4 1.5-8.5-6.2-6 8.5-1.2Zm15 30c9-4 15 5 25 0m-22 7c9-4 15 5 25 0m-22 7c9-4 15 5 25 0" />
        </g>
        <g className="stationery-envelope">
          <rect className="stationery-paper" x="17" y="51" width="120" height="75" rx="6" />
          <path className="stationery-fold" d="m19 121 43-37h30l43 37" />
          <path className="stationery-paper" d="m19 55 51 37a12 12 0 0 0 14 0l51-37" />
          <circle className="stationery-seal" cx="77" cy="93" r="11" />
          <path className="stationery-heart" d="M77 98s-7-4-7-8a4 4 0 0 1 7-2 4 4 0 0 1 7 2c0 4-7 8-7 8Z" />
          <path className="stationery-thread" d="M27 112h14m-14 5h9" />
        </g>
        <path className="stationery-glints" d="M24 22v14m-7-7h14m124 72v10m-5-5h10" />
      </svg>
    </div>
  );
}
