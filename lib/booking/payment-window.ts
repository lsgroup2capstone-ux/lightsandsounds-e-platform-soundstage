// Open synchronously from the click, before awaiting the checkout API.
export function openPaymentWindow() {
  const tab = window.open("about:blank", "_blank")
  if (!tab) throw new Error("Allow pop-ups for this site, then click Pay again.")
  tab.opener = null
  tab.document.title = "Opening secure payment…"
  tab.document.body.textContent = "Preparing your PayMongo checkout. Please wait…"
  return tab
}
