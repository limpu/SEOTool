/**
 * A lightweight required-property reference for the schema.org types the
 * master doc names (Section 21). Not exhaustive or a substitute for
 * Google's Rich Results documentation — just enough to catch the most
 * common "this type is basically unusable without X" omissions.
 */
export const SCHEMA_REQUIRED_PROPERTIES: Record<string, string[]> = {
  Organization: ["name", "url"],
  WebSite: ["name", "url"],
  WebPage: ["name"],
  BreadcrumbList: ["itemListElement"],
  Article: ["headline", "author", "datePublished"],
  BlogPosting: ["headline", "author", "datePublished"],
  Product: ["name"],
  Offer: ["price", "priceCurrency"],
  Review: ["reviewRating", "author"],
  AggregateRating: ["ratingValue"],
  LocalBusiness: ["name", "address"],
  Person: ["name"],
  FAQPage: ["mainEntity"],
  HowTo: ["name", "step"],
  Event: ["name", "startDate"],
  VideoObject: ["name", "uploadDate"],
  ImageObject: ["url"],
  ItemList: ["itemListElement"],
};

/**
 * Types where more than one instance on a single page is almost always a
 * mistake (there's only one Organization, one WebSite, one WebPage per
 * page). Types like Product/Review/ItemList are legitimately repeated, so
 * duplication is not checked for them.
 */
export const SINGULAR_SCHEMA_TYPES = new Set(["Organization", "WebSite", "WebPage", "LocalBusiness"]);
