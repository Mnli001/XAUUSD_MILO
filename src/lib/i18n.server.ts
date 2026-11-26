// Server side: every translation file is loaded once, so pages, Telegram messages and robot replies built on the server
// can be read in any of the languages. The browser gets only its reader's file, through PrefsProvider.
import { registerCatalog, type Catalog, type Locale } from "./i18n";
import ru from "../locales/ru.json";
import zh from "../locales/zh.json";
import ja from "../locales/ja.json";
import ko from "../locales/ko.json";
import es from "../locales/es.json";
import de from "../locales/de.json";
import fr from "../locales/fr.json";
import tr from "../locales/tr.json";
import pt from "../locales/pt.json";
import it from "../locales/it.json";
import id from "../locales/id.json";
import vi from "../locales/vi.json";
import th from "../locales/th.json";
import hi from "../locales/hi.json";
import pl from "../locales/pl.json";
import uk from "../locales/uk.json";
import nl from "../locales/nl.json";
import ar from "../locales/ar.json";

export const CATALOGS: Partial<Record<Locale, Catalog>> = { ru, zh, ja, ko, es, de, fr, tr, pt, it, id, vi, th, hi, pl, uk, nl, ar };
for (const [locale, catalog] of Object.entries(CATALOGS)) registerCatalog(locale as Locale, catalog);

/** One language's file, for the reader's browser; Mongolian and English need none. */
export const catalogFor = (locale: Locale): Catalog | null => CATALOGS[locale] ?? null;
