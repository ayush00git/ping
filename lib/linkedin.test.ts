import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assess,
  cityMatches,
  collegeMatches,
  companyMatches,
  compareNames,
  detailsNeededFor,
  linkedInSlugsIn,
  nameFromSlug,
  parseLinkedInUrl,
  primaryIndex,
  usernameGuesses,
  type AccountFacts,
  type Hints,
} from "./linkedin.ts";

const profile = (slug: string) => ({ kind: "profile", slug });
const facts = (f: Partial<AccountFacts>): AccountFacts => ({
  login: "x",
  name: null,
  company: null,
  location: null,
  bio: null,
  blog: null,
  social: [],
  repoHits: [],
  ...f,
});
const hints = (h: Partial<Hints>): Hints => ({ name: null, company: "", city: "", school: "", ...h });

// parseLinkedInUrl / nameFromSlug
test("www URL with ID", () => {
  assert.deepEqual(parseLinkedInUrl("https://www.linkedin.com/in/dan-abramov-6b4a43/"), profile("dan-abramov-6b4a43"));
  assert.equal(nameFromSlug("dan-abramov-6b4a43"), "Dan Abramov");
});
test("no scheme", () => {
  assert.deepEqual(parseLinkedInUrl("linkedin.com/in/jane-doe"), profile("jane-doe"));
  assert.equal(nameFromSlug("jane-doe"), "Jane Doe");
});
test("country subdomain + query", () => {
  assert.deepEqual(
    parseLinkedInUrl("https://in.linkedin.com/in/rahul-sharma-12345678?originalSubdomain=in"),
    profile("rahul-sharma-12345678"),
  );
  assert.equal(nameFromSlug("rahul-sharma-12345678"), "Rahul Sharma");
});
test("custom slug has no name", () => {
  assert.deepEqual(parseLinkedInUrl("linkedin.com/in/danabra"), profile("danabra"));
  assert.equal(nameFromSlug("danabra"), null);
});
test("percent-encoded non-ASCII", () => {
  assert.deepEqual(parseLinkedInUrl("https://www.linkedin.com/in/%C3%A9lodie-dupont-a1b2c3/"), profile("élodie-dupont-a1b2c3"));
  assert.equal(nameFromSlug("élodie-dupont-a1b2c3"), "Élodie Dupont");
});
test("CJK slug: no name after the ID", () => assert.equal(nameFromSlug("张伟-12a3b4"), null));
test("bare /in/ path + title suffix", () => {
  assert.deepEqual(parseLinkedInUrl("/in/john-smith-phd"), profile("john-smith-phd"));
  assert.equal(nameFromSlug("john-smith-phd"), "John Smith");
});
test("mixed case + subpath", () =>
  assert.deepEqual(parseLinkedInUrl("LinkedIn.com/in/Jane-Doe/details/experience/"), profile("jane-doe")));
test("company page", () =>
  assert.deepEqual(parseLinkedInUrl("linkedin.com/company/acme"), { kind: "not-profile", page: "company" }));
test("school page", () =>
  assert.deepEqual(parseLinkedInUrl("https://www.linkedin.com/school/iit-delhi/"), { kind: "not-profile", page: "school" }));
test("feed page", () =>
  assert.deepEqual(parseLinkedInUrl("https://www.linkedin.com/feed/"), { kind: "not-profile", page: "other" }));
test("non-LinkedIn URL", () => assert.equal(parseLinkedInUrl("https://github.com/gaearon"), null));
test("plain username", () => assert.equal(parseLinkedInUrl("gaearon"), null));
test("bad percent-encoding", () =>
  assert.deepEqual(parseLinkedInUrl("https://www.linkedin.com/in/%E0%A4%A"), { kind: "not-profile", page: "other" }));

// Link extraction and guesses
test("slug boundary", () =>
  assert.deepEqual(
    linkedInSlugsIn("https://linkedin.com/in/dan-abramov-2/ linkedin.com/in/Dan-Abramov?x=1 linkedin.com/in/dan-abramovich"),
    ["dan-abramov-2", "dan-abramov", "dan-abramovich"],
  ));
test("username guesses", () =>
  assert.deepEqual(usernameGuesses("dan-abramov-6b4a43", "Dan Abramov"), ["dan-abramov", "danabramov", "dabramov"]));

// Names
test("single word inside → partial", () => assert.equal(compareNames("Dan Abramov", "dan"), "partial"));
test("2+ words inside → full", () => {
  assert.equal(compareNames("John Michael Smith", "John Smith"), "full");
  assert.equal(compareNames("John Smith", "John Michael Smith"), "full");
});
test("same words, accents folded → full", () => {
  assert.equal(compareNames("Dan Abramov", "Dan Abramov"), "full");
  assert.equal(compareNames("José García", "jose garcia"), "full");
});
test("different → none", () => {
  assert.equal(compareNames("Dan Abramov", "Dan Brown"), "none");
  assert.equal(compareNames("Dan Abramov", null), "none");
});

// Details: whole words, not substrings
test("company: Meta ≠ @MetaMask", () => assert.equal(companyMatches("@MetaMask", "Meta"), false));
test("company: Google ⊂ Google DeepMind", () => assert.equal(companyMatches("Google DeepMind", "Google"), true));
test("company: filler words and @ dropped", () => {
  assert.equal(companyMatches("@acme", "Acme Inc."), true);
  assert.equal(companyMatches("Infosys Ltd", "Infosys Limited"), true);
});
test("company: several orgs", () => assert.equal(companyMatches("@facebook @google", "Google"), true));
test("city: country alone doesn't match", () => {
  assert.equal(cityMatches("India", "New Delhi, India"), false);
  assert.equal(cityMatches("New Delhi, India", "India"), false);
});
test("city: Delhi ⊂ New Delhi, India", () => assert.equal(cityMatches("New Delhi, India", "Delhi"), true));
test("city: Pune ⊂ Pune, Maharashtra, India", () => assert.equal(cityMatches("Pune, Maharashtra, India", "Pune"), true));
test("college: IIT ≠ IIITD", () => assert.equal(collegeMatches("IIITD alum", "IIT"), false));
test("college: whole words", () => assert.equal(collegeMatches("CS @ IIT Delhi", "IIT Delhi"), true));

// Tiers
test("substring false positives are not Likely", () => {
  assert.equal(assess("s", hints({ name: "Rahul Sharma", company: "Meta" }), facts({ name: "Rahul Sharma", company: "@MetaMask" })).tier, "possible");
  assert.equal(assess("s", hints({ name: "Rahul Sharma", school: "IIT" }), facts({ name: "Rahul Sharma", bio: "IIITD alum" })).tier, "possible");
  assert.equal(assess("s", hints({ name: "Rahul Sharma", city: "New Delhi, India" }), facts({ name: "Rahul Sharma", location: "India" })).tier, "possible");
});
test("partial name + matching city stays Possible, detail still listed", () => {
  const r = assess("s", hints({ name: "Rahul Sharma", city: "Delhi" }), facts({ name: "Rahul", location: "New Delhi, India" }));
  assert.equal(r.tier, "possible");
  assert.ok(r.evidence.some((e) => e.text === "City matches: New Delhi, India"));
  assert.equal(r.warning, "Only part of the name matches. Check their profile before choosing.");
});
test("full name + detail → Likely", () =>
  assert.equal(assess("s", hints({ name: "Rahul Sharma", company: "Google" }), facts({ name: "Rahul Sharma", company: "@google" })).tier, "likely"));
test("gaearon: partial name → Possible", () =>
  assert.equal(assess("dan-abramov-000000", hints({ name: "Dan Abramov" }), facts({ login: "gaearon", name: "dan" })).tier, "possible"));
test("profile README link → Confirmed", () =>
  assert.equal(assess("iannnblack", hints({}), facts({ login: "iannblack", repoHits: [{ repo: "iannblack", path: "README.md" }] })).tier, "confirmed"));
test("social link → Confirmed", () =>
  assert.equal(assess("jane-doe", hints({}), facts({ social: ["https://www.linkedin.com/in/jane-doe"] })).tier, "confirmed"));
test("other repo link → Likely", () =>
  assert.equal(assess("iannnblack", hints({}), facts({ login: "iannblack", repoHits: [{ repo: "dotfiles", path: "cv.md" }] })).tier, "likely"));
test("links a different profile → Ruled out", () => {
  const r = assess("jane-doe", hints({ name: "Jane Doe", company: "Acme" }), facts({ name: "Jane Doe", company: "Acme", social: ["https://linkedin.com/in/jane-doe-2"] }));
  assert.equal(r.tier, "ruled-out");
  assert.ok(r.evidence.some((e) => e.text === "Links to a different LinkedIn profile: linkedin.com/in/jane-doe-2"));
});
test("different link but no other evidence → hidden", () =>
  assert.equal(assess("jane-doe", hints({ name: "Jane Doe" }), facts({ name: "Someone Else", social: ["https://linkedin.com/in/someone"] })).tier, null));
test("no evidence → hidden", () =>
  assert.equal(assess("jane-doe", hints({ name: "Jane Doe" }), facts({ name: "Someone Else" })).tier, null));

// Common names (more than 100 GitHub accounts): Likely needs two matching details.
test("common-name threshold", () => {
  assert.equal(detailsNeededFor(null), 1);
  assert.equal(detailsNeededFor(100), 1);
  assert.equal(detailsNeededFor(101), 2);
});
test("common name: name + one detail stays Possible, with the detail listed", () => {
  const r = assess("s", hints({ name: "Rahul Sharma", city: "Delhi" }), facts({ name: "Rahul Sharma", location: "New Delhi" }), { detailsNeeded: 2 });
  assert.equal(r.tier, "possible");
  assert.ok(r.evidence.some((e) => e.text === "City matches: New Delhi"));
  assert.equal(r.warning, "Common name, and only one other detail matches. Check their profile before choosing.");
});
test("common name: name + two details → Likely", () => {
  const r = assess(
    "s",
    hints({ name: "Rahul Sharma", city: "Delhi", company: "Google" }),
    facts({ name: "Rahul Sharma", location: "New Delhi", company: "@google" }),
    { detailsNeeded: 2 },
  );
  assert.equal(r.tier, "likely");
});
test("common name: a link from another repo still counts on its own", () => {
  const r = assess("s", hints({ name: "Rahul Sharma" }), facts({ name: "Rahul Sharma", repoHits: [{ repo: "cv", path: "index.md" }] }), { detailsNeeded: 2 });
  assert.equal(r.tier, "likely");
});

// Ties: the filled button goes to at most one account.
test("primary: the only Confirmed", () => assert.equal(primaryIndex(["confirmed", "likely", "possible"]), 0));
test("primary: the only Likely when nothing is Confirmed", () => assert.equal(primaryIndex(["likely", "possible", "ruled-out"]), 0));
test("primary: tie in Likely → none", () => assert.equal(primaryIndex(["likely", "likely", "possible"]), null));
test("primary: tie in Confirmed → none, even with one Likely", () => assert.equal(primaryIndex(["confirmed", "confirmed", "likely"]), null));
test("primary: only Possible / Ruled out → none", () => assert.equal(primaryIndex(["possible", "ruled-out"]), null));
