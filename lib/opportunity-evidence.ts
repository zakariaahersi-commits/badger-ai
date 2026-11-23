/**
 * Internal evidence register for founder-facing opportunity labels.
 *
 * This file is deliberately not imported by the onboarding client. Founders see
 * a short, plain-English signal label; Badger keeps the evidence and reuse
 * terms here so every stronger claim remains auditable.
 */
export type OpportunityEvidence = {
  id: string;
  title: string;
  publisher: "UK Contracts Finder";
  noticeUrl: string;
  licence: "Open Government Licence v3.0";
  licenceUrl: string;
  awardedOn: string;
  awardedValueGbp: number;
  checkedOn: string;
};

export const OPPORTUNITY_EVIDENCE: OpportunityEvidence[] = [
  {
    id: "cf-landlord-licensing-2024",
    title: "Selective Landlord Licensing Software",
    publisher: "UK Contracts Finder",
    noticeUrl: "https://www.contractsfinder.service.gov.uk/Notice/d46aaadc-8cef-4f67-8d5f-983306405fc3",
    licence: "Open Government Licence v3.0",
    licenceUrl: "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
    awardedOn: "2024-11-07",
    awardedValueGbp: 65_000,
    checkedOn: "2026-08-25",
  },
  {
    id: "cf-construction-cost-book-2025",
    title: "PPG Enhancement Plan and cost book",
    publisher: "UK Contracts Finder",
    noticeUrl: "https://www.contractsfinder.service.gov.uk/Notice/4436de92-8d03-4140-8121-7a19a355f5bf",
    licence: "Open Government Licence v3.0",
    licenceUrl: "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
    awardedOn: "2024-11-29",
    awardedValueGbp: 79_750,
    checkedOn: "2026-08-25",
  },
  {
    id: "cf-duplicate-payment-2025",
    title: "Cambridgeshire County Council Duplicate Payment Software",
    publisher: "UK Contracts Finder",
    noticeUrl: "https://www.contractsfinder.service.gov.uk/Notice/d2d538f5-2a00-4ca5-b706-5296e9f92e0f",
    licence: "Open Government Licence v3.0",
    licenceUrl: "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
    awardedOn: "2025-12-12",
    awardedValueGbp: 141_600,
    checkedOn: "2026-08-25",
  },
];

