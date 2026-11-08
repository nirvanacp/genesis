// Runs the adapter's page definitions on small hand-written pages shaped like Hacker News.
// The markup keeps only what the adapter reads; ids, names and tokens are made up.
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseHTML } from "linkedom";
import adapter from "../src/adapter.ts";

const layout = (body, { me = "alice" } = {}) => `<!doctype html><html><body><center><table id="hnmain"><tbody>
<tr><td><span class="pagetop"><b class="hnname"><a href="news">Hacker News</a></b></span>
<span class="pagetop">${me ? `<a id="me" href="user?id=${me}">${me}</a> | <a id="logout" href="logout?auth=t0&amp;goto=news">logout</a>` : `<a href="login?goto=news">login</a>`}</span></td></tr>
<tr id="bigbox"><td>${body}</td></tr>
</tbody></table></center></body></html>`;

const storyRows = (id, { rank, title, href, site, score, user, voted = false, signedIn = true, comments = "12&nbsp;comments" }) => `
<tr class="athing submission" id="${id}">
  <td class="title"><span class="rank">${rank}.</span></td>
  <td class="votelinks"><center>${signedIn
    ? `<a id="up_${id}" class="clicky${voted ? " nosee" : ""}" href="vote?id=${id}&amp;how=up&amp;auth=tok${id}&amp;goto=news"><div class="votearrow" title="upvote"></div></a>`
    : `<a id="up_${id}" href="vote?id=${id}&amp;how=up&amp;goto=news"><div class="votearrow" title="upvote"></div></a>`}</center></td>
  <td class="title"><span class="titleline"><a href="${href}">${title}</a>${site ? ` <span class="sitebit comhead">(<a href="from?site=${site}"><span class="sitestr">${site}</span></a>)</span>` : ""}</span></td>
</tr>
<tr><td colspan="2"></td><td class="subtext"><span class="subline">
  <span class="score" id="score_${id}">${score}</span> by <a href="user?id=${user}" class="hnuser">${user}</a>
  <span class="age" title="2026-11-08T08:00:00"><a href="item?id=${id}">3 hours ago</a></span>
  ${voted ? `| <a id="un_${id}" class="clicky" href="vote?id=${id}&amp;how=un&amp;auth=tok${id}&amp;goto=news">unvote</a>` : ""}
  | <a href="hide?id=${id}&amp;goto=news">hide</a> | <a href="item?id=${id}">${comments}</a>
</span></td></tr>
<tr class="spacer" style="height:5px"></tr>`;

const feedPage = ({ signedIn = true } = {}) => layout(`<table><tbody>
${storyRows("1001", { rank: 1, title: "A  story\n about parsers", href: "https://example.com/parsers", site: "example.com", score: "120 points", user: "bob", signedIn })}
${storyRows("1002", { rank: 2, title: "Ask HN: Text posts?", href: "item?id=1002", score: "40 points", user: "carol", voted: signedIn, signedIn, comments: "discuss" })}
<tr class="morespace"></tr><tr><td colspan="2"></td><td class="title"><a href="?p=2" class="morelink" rel="next">More</a></td></tr>
</tbody></table>`, { me: signedIn ? "alice" : null });

const commentRow = (id, { indent, parent, user, text, voted = false, userClass = true }) => `
<tr class="athing comtr" id="${id}"><td><table><tbody><tr>
  <td class="ind" indent="${indent}"><img src="s.gif" height="1" width="${indent * 40}"></td>
  <td class="votelinks"><center><a id="up_${id}" class="clicky${voted ? " nosee" : ""}" href="vote?id=${id}&amp;how=up&amp;auth=tok${id}&amp;goto=item%3Fid%3D2001"><div class="votearrow"></div></a></center></td>
  <td class="default"><div style="margin-top:2px; margin-bottom:-10px;"><span class="comhead">
    <a href="user?id=${user}"${userClass ? ' class="hnuser"' : ""}>${user}</a> <span class="age"><a href="item?id=${id}">1 hour ago</a></span>
    ${voted ? `<span id="unv_${id}"> | <a id="un_${id}" class="clicky" href="vote?id=${id}&amp;how=un&amp;auth=tok${id}">unvote</a></span>` : ""}
    <span class="navs">${parent ? ` | <a href="#${parent}" class="clicky">parent</a>` : ""} | <a href="#${id}" class="clicky">next</a> <a class="togg clicky" n="1" href="javascript:void(0)">[–]</a></span>
  </span></div><br><div class="comment"><div class="commtext c00">${text}</div>
  <div class="reply"><p><font size="1"><u><a href="reply?id=${id}&amp;goto=item%3Fid%3D2001%23${id}">reply</a></u></font></p></div></div></td>
</tr></tbody></table></td></tr>`;

const itemPage = () => layout(`<table class="fatitem"><tbody>
${storyRows("2001", { rank: "", title: "Show HN: A thread", href: "https://example.org/", site: "example.org", score: "8 points", user: "dave" })}
<tr><td colspan="2"></td><td><div class="toptext">Hello <i>there</i>.<p>See <a href="https://example.org/docs">docs</a>.</p></div></td></tr>
<tr><td colspan="2"></td><td><form action="comment" method="post"><input type="hidden" name="parent" value="2001"><textarea name="text"></textarea><input type="submit" value="add comment"></form></td></tr>
</tbody></table><br><table class="comment-tree"><tbody>
${commentRow("3001", { indent: 0, user: "erin", text: "Top level <code>code</code>" })}
${commentRow("3002", { indent: 1, parent: "3001", user: "frank", text: "A reply", voted: true })}
${commentRow("3003", { indent: 0, user: "grace", text: "Another one", userClass: false })}
</tbody></table><a href="item?id=2001&amp;p=2" class="morelink" rel="next">More</a>`);

const userPage = () => layout(`<table><tbody>
<tr class="athing"><td valign="top">user:</td><td timestamp="1"><a href="user?id=bob" class="hnuser">bob</a></td></tr>
<tr><td valign="top">created:</td><td><a href="front?day=2010-01-01&amp;birth=bob">January 1, 2010</a></td></tr>
<tr><td valign="top">karma:</td><td>4242</td></tr>
<tr><td valign="top">about:</td><td style="overflow:hidden;">Writes <i>parsers</i>.</td></tr>
<tr><td></td><td><a href="submitted?id=bob"><u>submissions</u></a></td></tr>
</tbody></table>`);

const parse = html => parseHTML(html).document;

/** Reads a region the way the runtime does: items under the root, each with its key and data. */
function readRegion(doc, pageId, name) {
  const region = adapter.pages[pageId].regions[name];
  const root = doc.querySelector(region.root);
  if (!root) return null;
  if (region.kind === "single") return { key: region.key?.(root) ?? name, data: region.read(root), root };
  return [...root.querySelectorAll(region.items)].map(item => ({ key: region.key(item), data: region.read(item), item }));
}

test("pages are ready on HN's layout only", () => {
  for (const id of ["feed", "item", "user"]) {
    assert.equal(adapter.pages[id].ready(parse(feedPage())), true);
    assert.equal(adapter.pages[id].ready(parse("<html><body>Sorry.</body></html>")), false);
  }
});

test("the account comes from #me", () => {
  assert.equal(adapter.account(parse(feedPage())), "alice");
  assert.equal(adapter.account(parse(feedPage({ signedIn: false }))), null);
  assert.equal(adapter.signInUrl, "/login");
});

test("feed stories are keyed by item id and read their subtext row", () => {
  const doc = parse(feedPage());
  const stories = readRegion(doc, "feed", "stories");
  assert.deepEqual(stories.map(story => story.key), ["1001", "1002"]);
  assert.deepEqual(stories[0].data, {
    id: "1001", title: "A story about parsers", articleUrl: "https://example.com/parsers", domain: "example.com",
    submitter: "bob", score: "120 points", age: "3 hours ago", comments: "12 comments", rank: "1",
    canVote: true, voted: false,
  });
  assert.equal(stories[1].data.articleUrl, null, "a text post links to its own discussion");
  assert.equal(stories[1].data.comments, "discuss");
  assert.deepEqual([stories[1].data.canVote, stories[1].data.voted], [false, true]);
  // The extent is the subtext row, so a vote changing it re-reads the story.
  const extent = adapter.pages.feed.regions.stories.extent(stories[0].item);
  assert.ok(extent[0].querySelector(".subtext"));
  // Vote tokens stay in the page.
  assert.doesNotMatch(JSON.stringify(stories.map(story => story.data)), /auth|tok/);
});

test("the feed's more link and loadMore", () => {
  const doc = parse(feedPage());
  assert.deepEqual(readRegion(doc, "feed", "more").data, { url: "https://news.ycombinator.com/?p=2" });
  assert.deepEqual(adapter.pages.feed.actions.loadMore(null, undefined),
    { steps: [{ click: "a.morelink" }], navigates: true, expect: { page: "feed" } });
});

test("setVoted clicks HN's vote link and waits for the page to show the vote", () => {
  const doc = parse(feedPage());
  const [first, second] = readRegion(doc, "feed", "stories");
  const setVoted = adapter.pages.feed.regions.stories.actions.setVoted;
  const up = setVoted(first.item, { voted: true });
  assert.deepEqual(up.steps, [{ click: '[id="up_1001"]' }]);
  assert.equal(up.until(doc), false);
  doc.querySelector('[id="up_1001"]').classList.add("nosee");
  assert.equal(up.until(doc), true);
  assert.deepEqual(setVoted(first.item, { voted: true }), { satisfied: true });
  assert.deepEqual(setVoted(second.item, { voted: false }).steps, [{ click: '[id="un_1002"]' }]);
  assert.throws(() => setVoted(first.item, {}), /voted: boolean/);
});

test("setVoted refuses when HN shows no vote link to click", () => {
  const doc = parse(feedPage({ signedIn: false }));
  const [first] = readRegion(doc, "feed", "stories");
  assert.equal(first.data.canVote, true, "HN shows arrows to signed-out readers; the screen hides them");
  assert.deepEqual(adapter.pages.feed.regions.stories.actions.setVoted(first.item, { voted: false }), { satisfied: true });
  first.item.querySelector('[id="up_1001"]').remove();
  assert.throws(() => adapter.pages.feed.regions.stories.actions.setVoted(first.item, { voted: true }), /cannot be upvoted/);
});

test("an item page reads its head, a keyed thread with parents and depths, and its more link", () => {
  const doc = parse(itemPage());
  const head = readRegion(doc, "item", "story");
  assert.equal(head.key, "2001");
  assert.equal(head.data.story.title, "Show HN: A thread");
  assert.equal(head.data.comment, null);
  assert.equal(head.data.canComment, true);
  assert.deepEqual(head.data.text.map(part => part.text), ["Hello ", "there", ".", "\n\n", "See ", "docs", "."]);
  assert.equal(head.data.text[5].href, "https://example.org/docs");

  const comments = readRegion(doc, "item", "comments");
  assert.deepEqual(comments.map(entry => [entry.key, entry.data.depth, entry.data.parent]),
    [["3001", 0, null], ["3002", 1, "3001"], ["3003", 0, null]]);
  const reply = comments[1].data;
  assert.equal(reply.author, "frank");
  assert.equal(comments[2].data.author, "grace", "the user link names the author without .hnuser");
  assert.deepEqual([reply.canVote, reply.voted, reply.canReply], [false, true, true]);
  assert.deepEqual(reply.links, [], "thread rows carry no navigation links");
  assert.deepEqual(comments[0].data.parts, [{ text: "Top level " }, { text: "code", code: true }]);
  assert.deepEqual(readRegion(doc, "item", "more").data, { url: "https://news.ycombinator.com/item?id=2001&p=2" });

  const vote = adapter.pages.item.regions.comments.actions.setVoted(comments[0].item, { voted: true });
  assert.deepEqual(vote.steps, [{ click: '[id="up_3001"]' }]);
  const headVote = adapter.pages.item.regions.story.actions.setVoted(head.root, { voted: true });
  assert.deepEqual(headVote.steps, [{ click: '[id="up_2001"]' }]);
});

test("a user page reads the profile table", () => {
  const profile = readRegion(parse(userPage()), "user", "profile");
  assert.deepEqual(profile.data, {
    name: "bob", created: "January 1, 2010", karma: "4242",
    about: [{ text: "Writes " }, { text: "parsers", em: true }, { text: "." }],
  });
});
