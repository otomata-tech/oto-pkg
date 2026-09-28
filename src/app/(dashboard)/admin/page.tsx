import { redirect } from "next/navigation"

// `/admin` s'ouvre sur l'organisation (E08-S03, AC1) : le tableau de bord n'a pas de page d'accueil à lui.
export default function AdminPage() {
  redirect("/admin/organisation")
}
