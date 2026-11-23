import { redirect } from "next/navigation";

// Bo is one partner throughout the product. Keep the old URL working without
// presenting a second programme or separate CXO product.
export default function BuilderPage() {
  redirect("/");
}
