// Media queries shared by scripts; the same breakpoints appear in src/styles/.
export const MOBILE_QUERY = "(max-width: 700px)";
export const NOT_MOBILE_QUERY = "not all and (max-width: 700px)";
// Wide fine-pointer screens fit the whole homepage into one viewport.
export const DESKTOP_FIT_QUERY = "(min-width: 901px) and (pointer: fine)";
// Extra scene ornaments need both wide margins and enough vertical room.
export const DESKTOP_DECORATION_QUERY = "(min-width: 1366px) and (min-height: 680px) and (pointer: fine)";
export const FINE_HOVER_QUERY = "(hover: hover) and (pointer: fine)";
export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
