const AGE_CONFIRMATION_KEY = "nest-posts-age-confirmed";

export function hasAgeConfirmation() {
  try {
    return window.sessionStorage.getItem(AGE_CONFIRMATION_KEY) === "18+";
  } catch {
    return false;
  }
}

export function rememberAgeConfirmation() {
  try {
    window.sessionStorage.setItem(AGE_CONFIRMATION_KEY, "18+");
  } catch {
    // With storage unavailable, confirmation lasts only for this mounted page.
  }
}
