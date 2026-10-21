import type { PublicReview } from "./api/stages";

/**
 * Two people to review, for looking at the client's page without a server (and for its tests). The link
 * `#/review/preview` shows them. Nothing here is real, and nothing is sent anywhere.
 */
export const REVIEW_FIXTURE: PublicReview = {
  campaign: { title: "Senior Backend Engineer", company: "Acme Fintech", orgName: "Northline Search", orgLogoUrl: null },
  stageName: "Client review",
  candidates: [
    {
      id: "fx-1", name: "Meera Iyer", headline: "Staff engineer, payments platform", location: "Bengaluru", yearsExperience: 9,
      skills: ["Go", "PostgreSQL", "Kafka", "AWS"],
      summary: "Builds payment systems that stay up. Led the move of a card-processing service to event-driven design and cut failed settlements by a third.",
      whyMatch: "Nine years on payment infrastructure, the last four leading a team of six. Has run on-call for a service at your scale.",
      experience: [
        { title: "Staff Engineer", company: "Razorpay", startDate: "2021-03-01", endDate: null, isCurrent: true },
        { title: "Senior Engineer", company: "Flipkart", startDate: "2017-06-01", endDate: "2021-02-01", isCurrent: false },
      ],
      education: [{ school: "NIT Trichy", degree: "B.Tech", field: "Computer Science", startYear: 2011, endYear: 2015 }],
      screening: [
        { question: "Notice period?", answer: "Sixty days, can start in January." },
        { question: "Why are you looking?", answer: "Wants to own a platform end to end again." },
      ],
      resumeUrl: null, verdict: null,
    },
    {
      id: "fx-2", name: "Arjun Nair", headline: "Backend engineer", location: "Pune", yearsExperience: 6,
      skills: ["Java", "Spring", "Redis"],
      summary: "Steady, careful engineer with a lot of ownership on a lending product.",
      whyMatch: "Six years in fintech backends, comfortable with audits and compliance work.",
      experience: [{ title: "Senior Software Engineer", company: "Capital Float", startDate: "2019-01-01", endDate: null, isCurrent: true }],
      education: [],
      screening: [],
      resumeUrl: null, verdict: null,
    },
  ],
};
