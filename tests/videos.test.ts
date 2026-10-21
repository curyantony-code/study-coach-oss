import { beforeEach, describe, expect, test, vi } from "vitest";
import { openDb, type Db } from "@/lib/db/client";
import { findVideos, rankVideos } from "@/lib/videos/service";
import { buildQueries, keyTerms, matchVideo, plainText, significantWords, subjectOf, topicForCard, topicsOf, youtubeSearchUrl } from "@/lib/videos/topic";
import { decodeEntities, parseDuration, searchYouTube, VideoSearchError, type Video } from "@/lib/videos/youtube";

const NOTE = {
  title: "FIN 101 - Node 2 - Portfolio Selection",
  body: String.raw`# Portfolio Selection

Intro text about combining assets.

## Diversification and Portfolio Risk
**Systematic risk** affects nearly all assets; **unsystematic risk** shrinks in large portfolios.
As $n$ grows the variance falls toward the average covariance: $$\sigma_P^2 = \frac{1}{n}\bar\sigma^2$$

### Naive diversification
Equal weights across many assets. See [[FIN 101 - Node 3 - CAPM#Equilibrium Results|the CAPM note]].

## Two Risky Assets
The **minimum-variance portfolio** and the **efficient frontier** come from varying the weights.
**Formula required:** not a term. The **correlation coefficient** drives the benefit.

## Tiny
Short.

## Assigned Problems

### Ch7-P4 First
**Problem.** A problem statement that is long enough to count as real prose in this section.
**Solution.** 1.

### Ch7-P5 Second
**Problem.** Another problem statement that is long enough to count as real prose here.
**Solution.** 2.
`,
};

describe("reading a topic from a note", () => {
  const topics = topicsOf(NOTE);
  const topic = (section: string) => topics.find((t) => t.section === section)!;

  test("strips course codes and numbering from the subject", () => {
    expect(subjectOf("FIN 101 - Node 2 - Portfolio Selection")).toBe("Portfolio Selection");
    expect(subjectOf("Week 3 — Workplace Laws")).toBe("Workplace Laws");
    expect(subjectOf("MKTG 201 - Ch 15 - Communicating Insights")).toBe("Communicating Insights");
    expect(subjectOf("Photosynthesis")).toBe("Photosynthesis");
  });

  test("offers the whole note, then each section with real content", () => {
    expect(topics.map((t) => t.section)).toEqual(["", "Diversification and Portfolio Risk", "Two Risky Assets"]);
  });

  test("takes key ideas from sub-headings and bolded terms, not from labels or formulas", () => {
    expect(topic("Diversification and Portfolio Risk").terms).toEqual(["Naive diversification", "Systematic risk", "unsystematic risk"]);
    expect(topic("Two Risky Assets").terms).toEqual(["minimum-variance portfolio", "efficient frontier", "correlation coefficient"]);
  });

  test("the whole-note topic leaves worked problems out", () => {
    expect(topic("").name).toBe("Portfolio Selection");
    expect(topic("").terms).toContain("efficient frontier");
    expect(topic("").terms.join(" ")).not.toMatch(/Ch7|Problem|Solution/);
  });

  test("prefers what a passage defines and tabulates over text that is merely emphasised", () => {
    const section = "Risk falls at a **decreasing rate** as assets are added.\n\n| Systematic (market) risk | Unsystematic (firm-specific) risk |\n|---|---|\n| Affects all assets | Affects one firm |\n\n**Market risk**: what remains.\n";
    expect(keyTerms(section)).toEqual(["Systematic risk", "Unsystematic risk", "Market risk", "decreasing rate"]);
  });

  test("a table whose first column is a generic label names its ideas in the rows", () => {
    const table = "| Strategy | Construction |\n|---|---|\n| Protective put | Long stock + long put |\n| Covered call | Long stock + short call |\n\n| Symbol | Meaning |\n|---|---|\n| $C$ | Call price |\n";
    expect(keyTerms(table)).toEqual(["Protective put", "Covered call"]);
  });

  test("leaves out sections that only organise the note", () => {
    const note = { title: "T", body: "## Variables Glossary\n" + "word ".repeat(40) + "\n## Common Exam Traps\n" + "word ".repeat(40) + "\n## Real Topic\n" + "word ".repeat(40) };
    expect(topicsOf(note).map((t) => t.section)).toEqual(["", "Real Topic"]);
  });

  test("plainText removes formulas, code and link syntax", () => {
    expect(plainText("See [[Note#Part|the part]] and $x^2$ and `code` **bold**")).toBe("See the part and and code bold");
    expect(keyTerms("**Problem.** x\n**Real idea** y\n**Real idea** again")).toEqual(["Real idea"]);
  });

  test("builds several wordings of the search, most specific first", () => {
    expect(buildQueries(topic("Two Risky Assets"))).toEqual([
      "Two Risky Assets Portfolio Selection explained",
      "minimum-variance portfolio efficient frontier correlation coefficient Portfolio Selection explained",
      "Two Risky Assets Portfolio Selection lecture",
      "minimum-variance portfolio Two Risky Assets tutorial",
    ]);
    expect(buildQueries(topic(""))[0]).toBe("Portfolio Selection explained");
    expect(youtubeSearchUrl("a b&c")).toBe("https://www.youtube.com/results?search_query=a%20b%26c");
  });
});

describe("matching a video to a topic", () => {
  const topic = topicsOf(NOTE).find((t) => t.section === "Two Risky Assets")!;

  test("a video on the topic that covers its ideas is a strong match", () => {
    const match = matchVideo(
      { title: "Portfolio of Two Risky Assets: Efficient Frontier", description: "Minimum variance portfolio, correlation coefficients and the frontier." },
      topic
    );
    expect(match.label).toBe("strong");
    expect(match.covers).toEqual(["minimum-variance portfolio", "efficient frontier", "correlation coefficient"]);
    expect(match.missing).toEqual([]);
  });

  test("a video on the topic that skips some ideas is partial, and says what is missing", () => {
    const match = matchVideo({ title: "Two risky assets", description: "Weights and expected return." }, topic);
    expect(match.label).toBe("partial");
    expect(match.missing).toEqual(["minimum-variance portfolio", "efficient frontier", "correlation coefficient"]);
  });

  test("an unrelated video is weak", () => {
    expect(matchVideo({ title: "How to bake sourdough", description: "Flour, water, salt." }, topic)).toMatchObject({ label: "weak", score: 0, covers: [] });
  });

  test("ignores filler words and simple plurals", () => {
    expect(significantWords("The Assets of a Frontier and its Portfolios")).toEqual(["asset", "frontier", "portfolio"]);
  });

  test("ranks the best match first and keeps YouTube's order for ties", () => {
    const video = (id: string, title: string, description = ""): Video => ({ id, title, description, channel: "c", publishedAt: "", thumbnail: "", seconds: 600 });
    const ranked = rankVideos(
      [video("a", "Unrelated cooking"), video("b", "Two risky assets"), video("c", "Two Risky Assets efficient frontier", "minimum variance portfolio"), video("d", "Also unrelated")],
      topic
    );
    expect(ranked.map((v) => v.id)).toEqual(["c", "b", "a", "d"]);
  });
});

describe("YouTube search", () => {
  const searchBody = {
    items: [
      { id: { videoId: "abc123XYZ_-" }, snippet: { title: "Risk &amp; Return: Two Assets", description: "It&#39;s explained", channelTitle: "Prof", publishedAt: "2024-01-01T00:00:00Z" } },
      { id: { videoId: "short000001" }, snippet: { title: "Quick tip", description: "", channelTitle: "Clips", publishedAt: "" } },
      { id: { videoId: "nolength001" }, snippet: { title: "No length reported", description: "", channelTitle: "X", publishedAt: "" } },
    ],
  };
  const detailsBody = { items: [{ id: "abc123XYZ_-", contentDetails: { duration: "PT12M5S" } }, { id: "short000001", contentDetails: { duration: "PT45S" } }] };
  const respond = (search: unknown, details: unknown = detailsBody, status = 200) =>
    vi.fn(async (url: URL | RequestInfo) => new Response(JSON.stringify(String(url).includes("/search") ? search : details), { status })) as unknown as typeof fetch;

  test("asks for embeddable, safe, English videos and decodes titles", async () => {
    const fetchFn = respond(searchBody);
    const videos = await searchYouTube("two risky assets", { apiKey: "KEY", base: "http://yt.test/v3", fetchFn });
    const firstUrl = new URL(String((fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]));
    expect(firstUrl.pathname).toBe("/v3/search");
    expect(Object.fromEntries(firstUrl.searchParams)).toMatchObject({ q: "two risky assets", type: "video", videoEmbeddable: "true", safeSearch: "strict", key: "KEY" });
    expect(videos[0]).toEqual({
      id: "abc123XYZ_-", title: "Risk & Return: Two Assets", description: "It's explained", channel: "Prof",
      publishedAt: "2024-01-01T00:00:00Z", thumbnail: "https://i.ytimg.com/vi/abc123XYZ_-/mqdefault.jpg", seconds: 725,
    });
  });

  test("drops very short clips and keeps videos whose length is unknown", async () => {
    const videos = await searchYouTube("q", { apiKey: "K", fetchFn: respond(searchBody) });
    expect(videos.map((v) => [v.id, v.seconds])).toEqual([["abc123XYZ_-", 725], ["nolength001", null]]);
  });

  test("still returns results when the lengths cannot be fetched", async () => {
    const fetchFn = vi.fn(async (url: URL | RequestInfo) =>
      String(url).includes("/search") ? new Response(JSON.stringify(searchBody)) : new Response("nope", { status: 500 })
    ) as unknown as typeof fetch;
    expect(await searchYouTube("q", { apiKey: "K", fetchFn })).toHaveLength(3);
  });

  test.each([
    [403, /daily search allowance/],
    [400, /did not accept the API key/],
    [500, /returned an error \(500\)/],
  ])("explains a %i response", async (status, message) => {
    await expect(searchYouTube("q", { apiKey: "K", fetchFn: respond({}, {}, status) })).rejects.toThrow(message);
  });

  test("explains a network failure and rejects malformed results", async () => {
    const offline = vi.fn(async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch;
    await expect(searchYouTube("q", { apiKey: "K", fetchFn: offline })).rejects.toThrow(VideoSearchError);
    await expect(searchYouTube("q", { apiKey: "K", fetchFn: respond({ items: [{ id: { videoId: "<script>" }, snippet: { title: "x" } }] }) })).rejects.toThrow(/unexpected format/);
    expect(await searchYouTube("q", { apiKey: "K", fetchFn: respond({ items: [] }) })).toEqual([]);
  });

  test("small parsers", () => {
    expect(parseDuration("PT1H2M3S")).toBe(3723);
    expect(parseDuration("PT45S")).toBe(45);
    expect(parseDuration("P1DT1M")).toBe(86460);
    expect(parseDuration("soon")).toBeNull();
    expect(decodeEntities("A &amp; B &lt;c&gt; &quot;d&quot; &#39;e&#39; &unknown;")).toBe("A & B <c> \"d\" 'e' &unknown;");
  });
});

describe("findVideos", () => {
  let db: Db;
  const NOW = new Date("2026-10-07T12:00:00Z");
  const body = {
    items: [
      { id: { videoId: "unrelated01" }, snippet: { title: "Stock market news today", description: "", channelTitle: "News" } },
      { id: { videoId: "ontopic0001" }, snippet: { title: "Two Risky Assets and the Efficient Frontier", description: "minimum variance portfolio, correlation coefficient", channelTitle: "Prof" } },
    ],
  };
  const fetchFn = () => vi.fn(async (url: URL | RequestInfo) => new Response(JSON.stringify(String(url).includes("/search") ? body : { items: [] }))) as unknown as typeof fetch;
  beforeEach(() => {
    db = openDb(":memory:");
  });

  test("without a key, offers ready-made YouTube searches instead", async () => {
    const result = await findVideos({ node: NOTE, section: "Two Risky Assets", variant: 0 }, { db, youtube: null });
    expect(result).toMatchObject({ configured: false, topic: { name: "Two Risky Assets" } });
    expect(result && !result.configured && result.links).toHaveLength(4);
    expect(result && !result.configured && result.links[0]).toEqual({
      query: "Two Risky Assets Portfolio Selection explained",
      url: "https://www.youtube.com/results?search_query=Two%20Risky%20Assets%20Portfolio%20Selection%20explained",
    });
  });

  test("puts the video that lines up with the note first, with alternatives after it", async () => {
    const result = await findVideos({ node: NOTE, section: "Two Risky Assets", variant: 0 }, { db, youtube: { apiKey: "K", fetchFn: fetchFn() }, now: NOW });
    if (!result || !result.configured) throw new Error("expected results");
    expect(result.videos.map((v) => [v.id, v.match.label])).toEqual([["ontopic0001", "strong"], ["unrelated01", "weak"]]);
    expect(result).toMatchObject({ query: "Two Risky Assets Portfolio Selection explained", variant: 0, hasOtherWording: true });
  });

  test("reuses saved results instead of searching again, until they are two weeks old", async () => {
    const calls = fetchFn();
    const deps = { db, youtube: { apiKey: "K", fetchFn: calls } };
    const input = { node: NOTE, section: "", variant: 0 };
    await findVideos(input, { ...deps, now: NOW });
    await findVideos(input, { ...deps, now: new Date(NOW.getTime() + 13 * 86400000) });
    expect(calls).toHaveBeenCalledTimes(2);
    await findVideos(input, { ...deps, now: new Date(NOW.getTime() + 15 * 86400000) });
    expect(calls).toHaveBeenCalledTimes(4);
  });

  test("a different wording is a different search, and the last wording says there are no more", async () => {
    const result = await findVideos({ node: NOTE, section: "Two Risky Assets", variant: 99 }, { db, youtube: { apiKey: "K", fetchFn: fetchFn() }, now: NOW });
    expect(result).toMatchObject({ configured: true, variant: 3, hasOtherWording: false, query: "minimum-variance portfolio Two Risky Assets tutorial" });
  });

  test("an unknown section is not found", async () => {
    expect(await findVideos({ node: NOTE, section: "Nope", variant: 0 }, { db, youtube: null })).toBeNull();
  });
});

describe("topicForCard", () => {
  const prose = "Diversification lowers risk because the returns of the two assets do not move together perfectly, and the benefit grows as correlation falls.";
  const node = {
    title: "FIN 101 - Node 2 - Portfolio Selection",
    body: `Intro.\n\n## Two Risky Assets\n\n${prose}\n\n**Minimum-variance portfolio**: the mix with the lowest risk.\n\n## Capital Allocation Line\n\nThe line from the risk-free rate through a risky portfolio shows every mix of the two, and its slope is the reward for each unit of risk taken.\n`,
  };

  test("a worked problem is searched by its name, without the chapter number", () => {
    const topic = topicForCard(node, { front: "Draw the tangent.", back: "**Sharpe ratio** is highest at the tangency.", problem: { heading: "Ch7-P6 Graphical Tangency", formula: null, note: null } });
    expect(topic.name).toBe("Graphical Tangency");
    expect(topic.subject).toBe("Portfolio Selection");
    expect(buildQueries(topic)[0]).toBe("Graphical Tangency Portfolio Selection explained");
  });

  test("another card is searched by the section it was made from", () => {
    const topic = topicForCard(node, { front: "Minimum-variance portfolio", back: "the mix with the lowest risk." });
    expect(topic.section).toBe("Two Risky Assets");
  });

  test("falls back to the whole note when the card's section cannot be found", () => {
    expect(topicForCard(node, { front: "Something else entirely here", back: "Not in the note at all." }).section).toBe("");
    expect(topicForCard(node, { front: "x", back: "y", problem: { heading: "Ch7-P6", formula: null, note: null } }).section).toBe("");
  });

  test("findVideos uses a card's topic when given one", async () => {
    const topic = topicForCard(node, { front: "q", back: "a", problem: { heading: "Ch7-CFA5 Diversification Statement", formula: null, note: null } });
    const results = await findVideos({ node, section: "", variant: 0, topic }, { db: openDb(":memory:"), youtube: null });
    expect(results?.configured).toBe(false);
    expect(results?.topic.name).toBe("Diversification Statement");
  });
});
