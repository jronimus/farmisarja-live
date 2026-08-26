import { ExternalLink } from "lucide-react";
import { translations } from "./i18n";
import type { Language } from "./types";

/**
 * Where every number on this site comes from.
 *
 * The page exists because credit was being paid in the wrong currency. A link to somebody's
 * GitHub repository sitting under a figure is no use to a reader — there is nothing to do
 * there — and it is also not much of an acknowledgement. Gathering the sources in one place
 * gives the reader somewhere to understand what he is looking at, gives each project a
 * proper credit with a sentence about what it does, and takes the clutter off the figures.
 *
 * Four of the five are somebody else's work. That is worth being plain about: this site
 * derives very little and reports a great deal.
 */

interface Source {
  name: string;
  url: string;
  /** What it is, and what on this site is built from it. */
  what: string;
  where: string;
  /** Anything a reader should know before trusting it. */
  caveat?: string;
}

export default function Sources({ language }: { language: Language }) {
  const t = translations(language);

  const sources: Source[] = language === "fi" ? [
    {
      name: "Fantasy Premier League",
      url: "https://fantasy.premierleague.com/api/bootstrap-static/",
      what: "Pelin virallinen rajapinta. Pisteet, hinnat, omistusprosentit, kokoonpanot, siirrot, otteluohjelma ja liigataulukot — kaikki mitä FPL itse julkaisee.",
      where: "Taulukko, Hinnat, ja jokaisen muun sivun pelaajatiedot.",
      caveat: "FPL kertoo vain voiko pelaaja pelata, ei sitä pelaako hän. Siksi sivustolla on muitakin lähteitä.",
    },
    {
      name: "FotMob",
      url: "https://www.fotmob.com",
      what: "Siirtohuhut lähteineen ja todennäköisyysarvioineen, jo toteutuneet siirrot maailmanlaajuiselta siirtolistalta, ennustetut avauskokoonpanot, sekä loukkaantuneiden ja pelikieltoisten listat paluuaikoineen.",
      where: "Uutiset-välilehti, ja paitojen merkit Taulukossa.",
      caveat: "Dokumentoimaton rajapinta. Luemme sitä varovasti — puoli liigaa puolessa tunnissa — ja jos se lakkaa vastaamasta, tiedot vanhenevat itsestään pois.",
    },
    {
      name: "FPL Core Insights",
      url: "https://github.com/olbauday/FPL-Core-Insights",
      what: "Avoin datasetti, joka yhdistää FPL:n viralliset luvut ottelukohtaisiin suoritustilastoihin: maaliodottama (xG), syöttöodottama (xA), laukaukset, isot paikat, puolustussuoritukset ja torjunnat. Päivittyy kolmesti vuorokaudessa.",
      where: "Tilastot-välilehti ja hintasivun xG-sarake.",
      caveat: "Pelaajatunnukset ovat FPL:n omia, joten luvut liittyvät suoraan oikeisiin pelaajiin ilman nimien arvailua.",
    },
    {
      name: "Fantasy Football Scout · AllAboutFPL",
      url: "https://www.fantasyfootballscout.co.uk",
      what: "Artikkelit RSS-syötteinä, lajiteltuna julkaisijan omien kategorioiden mukaan.",
      where: "Uutiset-välilehden Artikkelit-osio.",
      caveat: "Näytämme otsikon, alun ja linkin — juttu luetaan aina julkaisijan omalla sivulla.",
    },
  ] : [
    {
      name: "Fantasy Premier League",
      url: "https://fantasy.premierleague.com/api/bootstrap-static/",
      what: "The game's own official API. Points, prices, ownership, squads, transfers, fixtures and league tables — everything FPL itself publishes.",
      where: "The table, the price page, and the player data on every other page.",
      caveat: "FPL only ever says whether a player can play, never whether he will. That is why the other sources are here.",
    },
    {
      name: "FotMob",
      url: "https://www.fotmob.com",
      what: "Transfer rumours with their sources and a graded likelihood, completed moves off its worldwide transfer wire, predicted line-ups, and injury and suspension lists with expected returns.",
      where: "The news page, and the marks on the shirts in the table.",
      caveat: "An undocumented endpoint. It is read gently — half the league every half hour — and if it ever stops answering, what is stored simply ages out.",
    },
    {
      name: "FPL Core Insights",
      url: "https://github.com/olbauday/FPL-Core-Insights",
      what: "An open dataset fusing FPL's official figures with per-match performance statistics: expected goals and assists, shots, big chances, defensive contributions and saves. Rebuilt three times a day.",
      where: "The statistics page and the xG column on the price page.",
      caveat: "Its player ids are FPL's own, so the figures attach to the right players without any name matching.",
    },
    {
      name: "Fantasy Football Scout · AllAboutFPL",
      url: "https://www.fantasyfootballscout.co.uk",
      what: "Articles over RSS, sorted by the publishers' own categories.",
      where: "The articles section of the news page.",
      caveat: "We show the headline, the opening line and a link — the piece is always read on the publisher's own page.",
    },
  ];

  return <section className="sources-page">
    <p className="sources-intro">{t.sourcesIntro}</p>
    <div className="sources-list">
      {sources.map((source) => <article className="source-card" key={source.name}>
        <a href={source.url} target="_blank" rel="noopener noreferrer">
          <b>{source.name}</b> <ExternalLink />
        </a>
        <p>{source.what}</p>
        <p className="source-where"><b>{t.sourcesWhere}</b> {source.where}</p>
        {source.caveat && <p className="source-caveat">{source.caveat}</p>}
      </article>)}
    </div>
  </section>;
}
