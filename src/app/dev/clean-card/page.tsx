import { notFound } from "next/navigation";
import { CleanCardHarness } from "./CleanCardHarness";

/** A development-only board with the store on `window.__ccStore`, for checking the clean card by eye. */
export default function CleanCardDevPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }
  return <CleanCardHarness />;
}
