// lib/company-logos.ts
//
// Maps a company's exact display name (matches CustomerListItem.company
// from the API, i.e. Dim_Company.company in the warehouse) to a logo
// image. Only companies listed here get a logo — everyone else always
// falls back to the initials avatar.
//
// Files live directly in src/assets/ (not a logos/ subfolder). If a logo
// doesn't show up on a card, it's almost always the key string not
// matching the company name exactly as the API returns it.

import cilssLogo from "@/assets/cilss.png";
import eyLogo from "@/assets/ey.png";
import gopaLogo from "@/assets/Gopa.png";
import jadidaLogo from "@/assets/Jadida.png";
import lilasLogo from "@/assets/lilas.png";
import natilaitLogo from "@/assets/logo-natilait.png";
import magicHotelsLogo from "@/assets/magichotel.png";
import saidaGroupLogo from "@/assets/said.png";

export const COMPANY_LOGOS: Record<string, string> = {
  "CILSS": cilssLogo,
  "EY": eyLogo,
  "GOPA Worldwide Consultants": gopaLogo,
  "Jadida": jadidaLogo,
  "Lilas": lilasLogo,
  "Natilait": natilaitLogo,
  "Magic Hotels": magicHotelsLogo,
  "Saida Group": saidaGroupLogo,
};